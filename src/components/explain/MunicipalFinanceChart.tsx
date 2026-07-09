"use client";

import { useState } from "react";

/**
 * "Βαθμός Οικονομικής Ανεξαρτησίας" of Greek municipalities — the share of their
 * revenue that comes from their own resources (20,6%) vs state/other transfers.
 * Figures from the Ministry of Interior "Δείκτες Ο.Τ.Α." dashboard, report 1008
 * "Οικονομική Λειτουργία" (national aggregates). Interactive donut using the
 * pathLength=100 technique (r ≈ 15.9155 → circumference ≈ 100).
 */
const SLICES = [
    { id: "own", label: "Ίδια έσοδα", value: 20.6, display: "20,6%", color: "#fc550a" },
    { id: "other", label: "Κρατικές & λοιπές μεταβιβάσεις", value: 79.4, display: "79,4%", color: "#cbd5e1" },
];

const STATS = [
    { label: "Εισπραξιμότητα ιδίων εσόδων", value: "44,89%" },
    { label: "Ληξιπρόθεσμες προς τρίτους", value: "168 εκατ. €" },
];

export function MunicipalFinanceChart() {
    const [hovered, setHovered] = useState<string | null>(null);

    let cumulative = 0;
    const arcs = SLICES.map((s) => {
        const seg = { ...s, offset: 25 - cumulative };
        cumulative += s.value;
        return seg;
    });
    const focus = hovered ? SLICES.find((s) => s.id === hovered) ?? null : SLICES[0];

    return (
        <figure className="not-prose my-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <figcaption className="text-base font-semibold text-foreground">
                Πόσο «αυτόνομοι» οικονομικά είναι οι δήμοι;
            </figcaption>

            <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
                <div className="relative h-44 w-44 shrink-0" onMouseLeave={() => setHovered(null)}>
                    <svg viewBox="0 0 42 42" className="h-full w-full">
                        {arcs.map((a) => (
                            <circle
                                key={a.id}
                                cx="21"
                                cy="21"
                                r="15.9155"
                                fill="transparent"
                                stroke={a.color}
                                strokeWidth={hovered === a.id ? 6 : 5}
                                strokeDasharray={`${a.value} ${100 - a.value}`}
                                strokeDashoffset={a.offset}
                                opacity={hovered && hovered !== a.id ? 0.4 : 1}
                                onMouseEnter={() => setHovered(a.id)}
                                className="cursor-pointer transition-[stroke-width,opacity] duration-200"
                            />
                        ))}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-2xl font-bold text-foreground">{focus?.display}</span>
                        <span className="mt-0.5 max-w-[7rem] text-[11px] leading-tight text-muted-foreground">
                            {focus?.label}
                        </span>
                    </div>
                </div>

                <div className="w-full">
                    <ul className="space-y-1.5">
                        {SLICES.map((s) => (
                            <li
                                key={s.id}
                                onMouseEnter={() => setHovered(s.id)}
                                onMouseLeave={() => setHovered(null)}
                                className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                                    hovered === s.id ? "bg-muted" : ""
                                }`}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <span
                                        className="h-3 w-3 shrink-0 rounded-full"
                                        style={{ backgroundColor: s.color }}
                                    />
                                    <span className="truncate text-foreground">{s.label}</span>
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">{s.display}</span>
                            </li>
                        ))}
                    </ul>

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                        {STATS.map((st) => (
                            <div key={st.label}>
                                <div className="text-lg font-bold tabular-nums text-foreground">{st.value}</div>
                                <div className="text-[11px] leading-tight text-muted-foreground">{st.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <figcaption className="mt-4 text-xs leading-relaxed text-muted-foreground">
                Κατά μέσο όρο, μόνο το <strong>20,6%</strong> των εσόδων ενός δήμου προέρχεται από ίδιους πόρους
                (Βαθμός Οικονομικής Ανεξαρτησίας)· το υπόλοιπο καλύπτεται από κρατικές και λοιπές μεταβιβάσεις.
                Μάλιστα, εισπράττεται μόλις το 44,89% των ιδίων εσόδων. Πηγή:{" "}
                <a
                    href="https://deiktesota.gov.gr/reports/1008/view/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-orange"
                >
                    Δείκτες Ο.Τ.Α. — Οικονομική Λειτουργία, Υπουργείο Εσωτερικών
                </a>
                .
            </figcaption>
        </figure>
    );
}
