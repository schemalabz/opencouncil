"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

/**
 * The way back from a terminal failure. An outage that outlasts the attempt
 * budget drops every wake it touches, and a dropped wake is a reader who
 * asked something and heard nothing. This re-opens the failed rows of a
 * window the operator names; the next poller tick drains them.
 */

interface Outcome {
    matched: number;
    revived: number;
    folded: number;
    skipped: number;
}

const WINDOWS = [1, 6, 24, 72] as const;

export function RetryFailures() {
    const router = useRouter();
    const [hours, setHours] = useState<number>(24);
    const [busy, setBusy] = useState(false);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function retry() {
        const sure = window.confirm(
            `Να ξαναμπούν στην ουρά οι wakes που απέτυχαν οριστικά τις τελευταίες ${hours} ώρες;\n\n` +
                "Μόνο οι οριστικά αποτυχημένες γραμμές ξανανοίγουν. Ο poller τις τρέχει στο επόμενο tick, " +
                "και όσες στείλουν μήνυμα θα φτάσουν σε πραγματικούς αναγνώστες.",
        );
        if (!sure) return;

        setBusy(true);
        setError(null);
        try {
            const response = await fetch("/api/admin/queue/retry", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hours }),
            });
            if (!response.ok) {
                setError(`σφάλμα ${response.status}`);
                return;
            }
            setOutcome(await response.json());
            router.refresh();
        } catch {
            setError("δεν έγινε η κλήση");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Ξανά στην ουρά, όσες απέτυχαν τις τελευταίες</span>
            <select
                value={hours}
                onChange={(event) => setHours(Number(event.target.value))}
                disabled={busy}
                aria-label="Παράθυρο σε ώρες"
                className="rounded border bg-background px-1.5 py-0.5"
            >
                {WINDOWS.map((option) => (
                    <option key={option} value={option}>
                        {option}ω
                    </option>
                ))}
            </select>
            <button
                type="button"
                onClick={retry}
                disabled={busy}
                className="rounded border px-2 py-0.5 font-medium hover:bg-muted disabled:opacity-60"
            >
                {busy ? "…" : "Ξανά"}
            </button>
            {outcome && (
                <span className="text-muted-foreground">
                    {outcome.revived} ξανά στην ουρά
                    {outcome.folded > 0 ? ` · ${outcome.folded} ενώθηκαν` : ""}
                    {outcome.skipped > 0 ? ` · ${outcome.skipped} έμειναν` : ""}
                    {outcome.matched === 0 ? " — καμία αποτυχία στο παράθυρο" : ""}
                </span>
            )}
            {error && <span className="text-destructive">{error}</span>}
        </div>
    );
}
