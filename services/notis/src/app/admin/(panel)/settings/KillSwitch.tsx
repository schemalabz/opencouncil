"use client";

import { useEffect, useState } from "react";
import { OctagonAlert } from "lucide-react";
import { Switch } from "@opencouncil/ui/switch";

/**
 * Global outbound kill switch. PR 1 has no real deliveries, so this arms a
 * flag (persisted locally) that the Bird send path will honor in PR 2+.
 * It deliberately does NOT touch the playground — simulations keep running.
 */
const KEY = "notis:kill-switch";

export function KillSwitch() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setArmed(window.localStorage.getItem(KEY) === "1");
  }, []);

  function setSending(on: boolean) {
    if (!on) {
      const sure = window.confirm(
        "Να διακοπεί ΚΑΘΕ πραγματική αποστολή WhatsApp προς όλους τους χρήστες;\n\n" +
          "Το playground ΔΕΝ επηρεάζεται — οι προσομοιώσεις συνεχίζουν κανονικά.",
      );
      if (!sure) return;
    }
    const nextArmed = !on;
    setArmed(nextArmed);
    window.localStorage.setItem(KEY, nextArmed ? "1" : "0");
  }

  return (
    <section className="rounded-lg border border-destructive/50 bg-background p-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <OctagonAlert className="h-4 w-4 shrink-0 text-destructive" />
            Εξερχόμενες αποστολές
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Ο γενικός διακόπτης του Νότη: κλειστός, δεν φεύγει κανένα μήνυμα προς πραγματικούς
            χρήστες — templates, απαντήσεις, follow-ups, όλα. Το playground δεν επηρεάζεται.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <Switch
            checked={!armed}
            onCheckedChange={setSending}
            className="scale-125 data-[state=unchecked]:bg-destructive"
            aria-label="Εξερχόμενες αποστολές"
          />
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              armed ? "animate-pulse text-destructive" : "text-muted-foreground"
            }`}
          >
            {armed ? "κλειστές" : "ενεργές"}
          </span>
        </div>
      </div>
    </section>
  );
}
