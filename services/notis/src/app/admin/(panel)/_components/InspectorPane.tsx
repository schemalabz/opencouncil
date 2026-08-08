"use client";

import { useState } from "react";
import { Download, MousePointerClick, Rewind } from "lucide-react";
import { Badge } from "@opencouncil/ui/badge";
import { Button } from "@opencouncil/ui/button";
import { WakeTrace } from "@/agent/types";
import { WakeRecord } from "../_lib/records";

/** Simulator-only actions — omit them for the read-only conversation viewer. */
export interface InspectorSimActions {
  canRewind: boolean;
  onRewind(): void;
  onExport(): void;
}

interface Props {
  item?: WakeRecord;
  trace?: WakeTrace;
  profile: string;
  sim?: InspectorSimActions;
}

type Tab = "rationale" | "tools" | "context" | "cost";

interface RawBlock {
  type?: string;
  name?: string;
  input?: unknown;
  text?: string;
  content?: unknown;
}

export function InspectorPane({ item, trace, profile, sim }: Props) {
  const [tab, setTab] = useState<Tab>("rationale");

  if (!item || !item.outcome) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-[260px] text-center">
          <MousePointerClick className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Διάλεξε ένα βήμα από τη γραμμή χρόνου ή τη συνομιλία για να δεις τι σκέφτηκε ο Νότης.
          </p>
        </div>
      </div>
    );
  }

  const tabs: Array<[Tab, string]> = [
    ["rationale", "Σκεπτικό"],
    ["tools", "Εργαλεία"],
    ["context", "Context"],
    ["cost", "Κόστος"],
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b p-2">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? "default" : "ghost"}
            onClick={() => setTab(key)}
            className="px-2"
          >
            {label}
          </Button>
        ))}
        {sim && (
          <div className="ml-auto flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!sim.canRewind}
              onClick={sim.onRewind}
              className="px-2"
              title="Γύρνα την προσομοίωση στη στιγμή πριν από αυτό το βήμα"
            >
              <Rewind className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={sim.onExport}
              className="px-2"
              title="Export golden scenario"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {tab === "rationale" && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={item.outcome.decision === "send" ? "default" : "secondary"}>
                {item.outcome.decision === "send"
                  ? `έστειλε ${item.outcome.messages.length}`
                  : "σιωπή"}
              </Badge>
              {item.delivery && (
                <Badge variant="outline" title="Κανόνες WhatsApp: εκτός 24ώρου παραθύρου μόνο εγκεκριμένα templates">
                  {item.delivery.mode === "template"
                    ? `📋 ${item.delivery.template}`
                    : "💬 free-form (παράθυρο 24h ανοιχτό)"}
                </Badge>
              )}
            </div>
            <p className="whitespace-pre-wrap">{item.outcome.rationale}</p>
            {item.outcome.scheduledWakes.length > 0 && (
              <div>
                <p className="font-medium">Προγραμμάτισε:</p>
                {item.outcome.scheduledWakes.map((w, i) => (
                  <p key={i} className="text-muted-foreground">
                    {w.at} — {w.reason}
                  </p>
                ))}
              </div>
            )}
            {item.outcome.profileRewrite !== undefined && (
              <div>
                <p className="font-medium">Νέο προφίλ:</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {item.outcome.profileRewrite}
                </p>
              </div>
            )}
            <div>
              <p className="font-medium">Τρέχον προφίλ:</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{profile}</p>
            </div>
          </>
        )}

        {tab === "tools" &&
          (trace ? (
            trace.turns.map((turn, i) => (
              <div key={i} className="rounded border p-2">
                <p className="mb-1 text-xs text-muted-foreground">
                  turn {i + 1} · stop: {turn.stopReason}
                </p>
                {(turn.content as RawBlock[]).map((b, j) => {
                  if (b.type === "mcp_tool_use" || b.type === "tool_use")
                    return (
                      <p key={j} className="font-mono text-xs">
                        {b.type === "mcp_tool_use" ? "🔎" : "⚡"} {b.name}(
                        {JSON.stringify(b.input).slice(0, 120)})
                      </p>
                    );
                  if (b.type === "mcp_tool_result")
                    return (
                      <p key={j} className="font-mono text-xs text-muted-foreground">
                        ↳ result ({JSON.stringify(b.content).length} chars)
                      </p>
                    );
                  if (b.type === "text")
                    return (
                      <p key={j} className="text-xs italic">
                        {(b.text ?? "").slice(0, 200)}
                      </p>
                    );
                  return (
                    <p key={j} className="text-xs text-muted-foreground">
                      [{b.type}]
                    </p>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">Το trace αυτού του βήματος έχει απομακρυνθεί (LRU).</p>
          ))}

        {tab === "context" &&
          (trace ? (
            <>
              {trace.system.map((s, i) => (
                <details key={i} className="rounded border p-2">
                  <summary className="cursor-pointer text-xs">
                    system[{i}] {s.cached && <Badge variant="outline">cached</Badge>} ·{" "}
                    {s.text.length.toLocaleString()} chars
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs">
                    {s.text}
                  </pre>
                </details>
              ))}
              <details className="rounded border p-2" open>
                <summary className="cursor-pointer text-xs">
                  user turn · {trace.userTurn.length.toLocaleString()} chars
                </summary>
                <pre className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap text-xs">
                  {trace.userTurn}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-muted-foreground">Το trace αυτού του βήματος έχει απομακρυνθεί (LRU).</p>
          ))}

        {tab === "cost" &&
          (trace ? (
            <table className="w-full text-xs">
              <tbody>
                <tr>
                  <td>input</td>
                  <td className="text-right">{trace.usageTotal.input.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>output</td>
                  <td className="text-right">{trace.usageTotal.output.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>cache write</td>
                  <td className="text-right">{trace.usageTotal.cacheWrite.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>cache read</td>
                  <td className="text-right">{trace.usageTotal.cacheRead.toLocaleString()}</td>
                </tr>
                <tr className="font-medium">
                  <td>κόστος</td>
                  <td className="text-right">${trace.costUsd.toFixed(3)}</td>
                </tr>
                <tr>
                  <td>διάρκεια</td>
                  <td className="text-right">{(trace.durationMs / 1000).toFixed(1)}s</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-muted-foreground">Το trace αυτού του βήματος έχει απομακρυνθεί (LRU).</p>
          ))}
      </div>
    </div>
  );
}
