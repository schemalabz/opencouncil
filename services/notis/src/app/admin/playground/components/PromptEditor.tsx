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

interface Props {
  promptOverride?: string;
  shippedPrompt?: string;
  onPromptOverride(value?: string): void;
}

export function PromptEditor({ promptOverride, shippedPrompt, onPromptOverride }: Props) {
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
          <Button onClick={() => draft !== null && onPromptOverride(draft)} disabled={draft === null}>
            Χρήση στο επόμενο βήμα
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
