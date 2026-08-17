"use client";

import { useEffect, useState } from "react";
import { OctagonAlert } from "lucide-react";
import { Switch } from "@opencouncil/ui/switch";

/**
 * THE proactive switch, server-side in NotisSetting via the admin API: a
 * single global pause of all proactive sends and enrollments. Reactive
 * replies are never gated, and the playground is never affected. A fresh
 * deployment starts paused — unpausing after the inbound-only gate IS the
 * launch.
 */

interface Settings {
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

  async function put(change: Settings) {
    const response = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (response.ok) setSettings(await response.json());
    else setError(true);
  }

  function setSending(on: boolean) {
    const sure = window.confirm(
      on
        ? "Να ξεκινήσουν ΠΡΑΓΜΑΤΙΚΕΣ proactive αποστολές και εγγραφές;\n\n" +
            "Templates θα φτάνουν σε πραγματικούς χρήστες στο επόμενο tick του poller."
        : "Να διακοπεί ΚΑΘΕ proactive αποστολή και εγγραφή προς όλους τους χρήστες;\n\n" +
            "Οι απαντήσεις σε εισερχόμενα ΔΕΝ επηρεάζονται, ούτε το playground.",
    );
    if (!sure) return;
    void put({ paused: !on });
  }

  if (error) {
    return (
      <section className="rounded-lg border border-destructive/50 bg-background p-4 text-sm text-muted-foreground">
        Οι ρυθμίσεις proactive δεν είναι διαθέσιμες (χωρίς βάση ή σφάλμα δικτύου).
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-destructive/50 bg-background p-4">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <OctagonAlert className="h-4 w-4 shrink-0 text-destructive" />
            Proactive αποστολές
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Ο γενικός διακόπτης του Νότη: κλειστός, κανένα proactive μήνυμα δεν φεύγει και
            καμία νέα εγγραφή δεν γίνεται — templates, follow-ups, ενημερώσεις. Οι
            απαντήσεις σε εισερχόμενα συνεχίζουν κανονικά, όπως και το playground. Νέο
            deployment ξεκινά κλειστό· το άνοιγμα είναι η κυκλοφορία.
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
              settings?.paused ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {!settings ? "…" : settings.paused ? "κλειστές" : "ενεργές"}
          </span>
        </div>
      </div>
    </section>
  );
}
