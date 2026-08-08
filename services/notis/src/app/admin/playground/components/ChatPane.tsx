"use client";

import { useState } from "react";
import { Button } from "@opencouncil/ui/button";
import { Input } from "@opencouncil/ui/input";
import { QueueItem } from "../types";

interface Props {
  queue: QueueItem[];
  clock: string;
  busy: boolean;
  selectedId?: string;
  onSelect(id: string): void;
  onStep(): void;
  onSkip(): void;
  onUserMessage(text: string): void;
}

function eventCaption(item: QueueItem): string {
  const e = item.event;
  switch (e.type) {
    case "agenda_processed":
      return `πριν τη συνεδρίαση · ${e.meetingName}`;
    case "meeting_summarized":
      return `μετά τη συνεδρίαση · ${e.meetingName}`;
    case "scheduled":
      return "προγραμματισμένο follow-up";
    case "heartbeat":
      return "heartbeat";
    case "user_message":
      return "";
  }
}

export function ChatPane({ queue, clock, busy, selectedId, onSelect, onStep, onSkip, onUserMessage }: Props) {
  const [draft, setDraft] = useState("");
  const done = queue.filter((q) => q.status !== "pending");
  const next = queue.find((q) => q.status === "pending");

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto bg-[#efeae2] p-4">
        {done.map((item) => (
          <div key={item.id} onClick={() => onSelect(item.id)} className="cursor-pointer">
            {item.event.type === "user_message" && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">
                  {item.event.text}
                </div>
              </div>
            )}
            {item.status === "skipped" && (
              <p className="text-center text-xs text-muted-foreground/70">
                ⏭ {eventCaption(item)} (παραλείφθηκε)
              </p>
            )}
            {item.outcome?.decision === "silence" && (
              <p
                className={`text-center text-xs ${selectedId === item.id ? "text-foreground" : "text-muted-foreground/70"}`}
                title={item.outcome.rationale}
              >
                🤫 {eventCaption(item) || "σιωπή"} — σιωπή
              </p>
            )}
            {item.outcome?.messages.map((m, i) => (
              <div key={i} className="mb-2 flex justify-start">
                <div
                  className={`max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm shadow-sm ${selectedId === item.id ? "ring-2 ring-orange" : ""}`}
                >
                  {item.event.type !== "user_message" && (
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {eventCaption(item)}
                    </p>
                  )}
                  {m}
                </div>
              </div>
            ))}
          </div>
        ))}
        {done.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            Πάτα «Επόμενο γεγονός» για να ξεκινήσει η ιστορία.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t bg-background p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>🕐 {clock ? new Date(clock).toLocaleString("el-GR") : "—"}</span>
          {next && <span>επόμενο: {eventCaption(next) || next.event.type}</span>}
        </div>
        <div className="flex gap-2">
          <Button onClick={onStep} disabled={busy || !next} className="flex-1">
            {busy ? "Ο Νότης σκέφτεται..." : "Επόμενο γεγονός ▸"}
          </Button>
          <Button onClick={onSkip} disabled={busy || !next} variant="outline">
            Παράλειψη
          </Button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            onUserMessage(draft.trim());
            setDraft("");
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Γράψε στον Νότη ως χρήστης..."
            disabled={busy}
          />
          <Button type="submit" variant="secondary" disabled={busy || !draft.trim()}>
            Στείλε
          </Button>
        </form>
      </div>
    </div>
  );
}
