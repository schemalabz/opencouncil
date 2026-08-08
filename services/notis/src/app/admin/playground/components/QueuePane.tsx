"use client";

import { useState } from "react";
import { Badge } from "@opencouncil/ui/badge";
import { Button } from "@opencouncil/ui/button";
import { Textarea } from "@opencouncil/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@opencouncil/ui/dialog";
import { QueueItem, Snapshot } from "../types";

interface Props {
  queue: QueueItem[];
  snapshots: Snapshot[];
  promptOverride?: string;
  shippedPrompt?: string;
  onRestore(id: string): void;
  onPromptOverride(value?: string): void;
  onReset(): void;
}

function shortLabel(item: QueueItem): string {
  const e = item.event;
  const date = e.at.slice(0, 10);
  switch (e.type) {
    case "agenda_processed":
      return `${date} · ατζέντα · ${e.meetingName}`;
    case "meeting_summarized":
      return `${date} · πρακτικά · ${e.meetingName}`;
    case "user_message":
      return `${date} · μήνυμα χρήστη`;
    case "scheduled":
      return `${date} · follow-up`;
    case "heartbeat":
      return `${date} · heartbeat`;
  }
}

const statusIcon = { pending: "○", done: "●", skipped: "◌" } as const;

export function QueuePane({
  queue,
  snapshots,
  promptOverride,
  shippedPrompt,
  onRestore,
  onPromptOverride,
  onReset,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-2">
        <span className="text-sm font-medium">Γεγονότα ({queue.length})</span>
        <div className="flex gap-1">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant={promptOverride ? "default" : "outline"}>
                Prompt{promptOverride ? " *" : ""}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>System prompt {promptOverride ? "(override ενεργό)" : "(shipped)"}</DialogTitle>
              </DialogHeader>
              <Textarea
                rows={24}
                className="font-mono text-xs"
                value={draft ?? promptOverride ?? shippedPrompt ?? ""}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDraft(null);
                    onPromptOverride(undefined);
                  }}
                >
                  Επαναφορά shipped
                </Button>
                <Button
                  onClick={() => {
                    if (draft !== null) onPromptOverride(draft);
                  }}
                  disabled={draft === null}
                >
                  Χρήση στο επόμενο βήμα
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="ghost" onClick={onReset}>
            Reset
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {queue.map((item) => (
          <div key={item.id} className="flex items-start gap-2 py-1 text-xs">
            <span
              className={
                item.status === "done" ? "text-orange" : "text-muted-foreground"
              }
            >
              {statusIcon[item.status]}
            </span>
            <span className={item.status === "pending" ? "" : "text-muted-foreground"}>
              {shortLabel(item)}
              {item.outcome && (
                <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px]">
                  {item.outcome.decision === "send" ? `✉ ${item.outcome.messages.length}` : "🤫"}
                </Badge>
              )}
            </span>
          </div>
        ))}
      </div>

      {snapshots.length > 0 && (
        <div className="max-h-48 overflow-y-auto border-t p-2">
          <p className="mb-1 text-xs font-medium">Rewind</p>
          {[...snapshots].reverse().map((s) => (
            <button
              key={s.id}
              onClick={() => onRestore(s.id)}
              className="block w-full truncate rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              ⏪ {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
