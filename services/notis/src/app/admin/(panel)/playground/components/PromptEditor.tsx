"use client";

import { useState } from "react";
import { Button } from "@opencouncil/ui/button";
import { Textarea } from "@opencouncil/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@opencouncil/ui/dialog";

const EFFORTS = ["low", "medium", "high"] as const;

interface Props {
  promptOverride?: string;
  shippedPrompt?: string;
  onPromptOverride(value?: string): void;
  effort?: (typeof EFFORTS)[number];
  onEffort(value?: (typeof EFFORTS)[number]): void;
}

export function PromptEditor({
  promptOverride,
  shippedPrompt,
  onPromptOverride,
  effort,
  onEffort,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant={promptOverride ? "default" : "outline"}>
          Prompt{promptOverride ? " *" : ""}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            System prompt {promptOverride ? "(override ενεργό)" : "(shipped)"}
          </DialogTitle>
        </DialogHeader>
        <Textarea
          rows={24}
          className="font-mono text-xs"
          value={draft ?? promptOverride ?? shippedPrompt ?? ""}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex items-center justify-end gap-2">
          <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            effort
            <select
              value={effort ?? "low"}
              onChange={(e) => {
                const v = e.target.value as (typeof EFFORTS)[number];
                onEffort(v === "low" ? undefined : v);
              }}
              className="h-8 rounded border bg-background px-2 text-xs"
            >
              {EFFORTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                  {e === "low" ? " (shipped)" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            onClick={() => {
              setDraft(null);
              onPromptOverride(undefined);
            }}
          >
            Επαναφορά shipped
          </Button>
          <Button onClick={() => draft !== null && onPromptOverride(draft)} disabled={draft === null}>
            Χρήση στο επόμενο βήμα
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
