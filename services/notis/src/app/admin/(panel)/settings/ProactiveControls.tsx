"use client";

import { useEffect, useState } from "react";
import { OctagonAlert, Radio } from "lucide-react";
import { Switch } from "@opencouncil/ui/switch";

/**
 * The two proactive rails, server-side in NotisSetting via the admin API:
 *
 * - mode: shadow (wakes run and record, no proactive Bird call) | live.
 * - paused: the kill switch — a single global pause of all PROACTIVE
 *   sends. Reactive replies are never gated, and the playground is never
 *   affected.
 */

interface Settings {
  mode: "shadow" | "live";
  paused: boolean;
}

export function ProactiveControls() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setSettings)
      .catch(() => setError(true));
  }, []);

  async function put(change: Partial<Settings>) {
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (response.ok) setSettings(await response.json());
    else setError(true);
  }

  function setSending(on: boolean) {
    if (!on) {
      const sure = window.confirm(
        "Να διακοπεί ΚΑΘΕ proactive αποστολή προς όλους τους χρήστες;\n\n" +
          "Οι απαντήσεις σε εισερχόμενα ΔΕΝ επηρεάζονται, ούτε το playground.",
      );
      if (!sure) return;
    }
    void put({ paused: !on });
  }

  function setMode(live: boolean) {
    if (live) {
      const sure = window.confirm(
        "Να ενεργοποιηθούν ΠΡΑΓΜΑΤΙΚΕΣ proactive αποστολές (τέλος του shadow mode);\n\n" +
          "Templates θα φτάνουν σε πραγματικούς χρήστες στο επόμενο tick του poller.",
      );
      if (!sure) return;
    }
    void put({ mode: live ? "live" : "shadow" });
  }

  if (error) {
    return (
      <section className="rounded-lg border border-destructive/50 bg-background p-4 text-sm text-muted-foreground">
        Οι ρυθμίσεις proactive δεν είναι διαθέσιμες (χωρίς βάση ή σφάλμα δικτύου).
      </section>
    );
  }

  return (
    <>
      <section className="rounded-lg border border-destructive/50 bg-background p-4">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <OctagonAlert className="h-4 w-4 shrink-0 text-destructive" />
              Proactive αποστολές
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Ο γενικός διακόπτης του Νότη: κλειστός, κανένα proactive μήνυμα δεν φεύγει —
              templates, follow-ups, ενημερώσεις. Οι απαντήσεις σε εισερχόμενα συνεχίζουν
              κανονικά, όπως και το playground.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <Switch
              checked={settings ? !settings.paused : false}
              disabled={!settings}
              onCheckedChange={setSending}
              className="scale-125 data-[state=unchecked]:bg-destructive"
              aria-label="Proactive αποστολές"
            />
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider ${
                settings?.paused ? "animate-pulse text-destructive" : "text-muted-foreground"
              }`}
            >
              {!settings ? "…" : settings.paused ? "κλειστές" : "ενεργές"}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-background p-4">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
              Shadow mode
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Σε shadow, τα wakes τρέχουν και καταγράφονται πλήρως — αποφάσεις, μηνύματα,
              κόστος — αλλά καμία proactive αποστολή δεν φτάνει στο Bird· τα μηνύματα
              σημειώνονται «suppressed». Η μετάβαση σε live είναι η στιγμή της
              κυκλοφορίας.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <Switch
              checked={settings?.mode === "live"}
              disabled={!settings}
              onCheckedChange={setMode}
              className="scale-125"
              aria-label="Shadow ή live"
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {!settings ? "…" : settings.mode === "live" ? "live" : "shadow"}
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
