import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";

/**
 * Distribution of Greek municipalities by population, below "Οι Δήμοι στην
 * Ελλάδα". Counts are from the 2021 census (ΕΛΣΤΑΤ) for the 332 municipalities.
 * Extremes: Δ. Αθηναίων (~640.000) and Δ. Γαύδου (142).
 */
const TOTAL = 332;

const BUCKETS = [
    { id: "xl", label: "Πάνω από 100.000", count: 16 },
    { id: "l", label: "50.000 – 100.000", count: 49 },
    { id: "m", label: "20.000 – 50.000", count: 89 },
    { id: "s", label: "10.000 – 20.000", count: 79 },
    { id: "xs", label: "5.000 – 10.000", count: 49 },
    { id: "xxs", label: "Κάτω από 5.000", count: 50 },
];

const MAX = Math.max(...BUCKETS.map((b) => b.count));

export function MunicipalitiesChart() {
    return (
        <figure className="not-prose my-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <figcaption className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">Οι 332 δήμοι κατά πληθυσμό</h3>
                <span className="shrink-0 text-sm text-muted-foreground">Σύνολο: 332 δήμοι</span>
            </figcaption>

            <ul className="mt-5 space-y-3.5">
                {BUCKETS.map((b) => {
                    const pctOfMax = (b.count / MAX) * 100;
                    const pctOfTotal = Math.round((b.count / TOTAL) * 100);
                    return (
                        <li key={b.id}>
                            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                                <span className="font-medium text-foreground">
                                    {b.label} <span className="text-muted-foreground">κάτοικοι</span>
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                    {b.count} δήμοι · {pctOfTotal}%
                                </span>
                            </div>
                            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-orange" style={{ width: `${pctOfMax}%` }} />
                            </div>
                        </li>
                    );
                })}
            </ul>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Μεγαλύτερος
                        </div>
                        <Link
                            href="/athens"
                            className="unstyled group inline-flex shrink-0 items-center gap-1 text-xs font-medium text-orange hover:text-orange/80"
                        >
                            Δες τον Δήμο
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                    <div className="mt-1 font-semibold text-foreground">Δήμος Αθηναίων</div>
                    <div className="text-sm text-muted-foreground">~640.000 κάτοικοι</div>
                </div>
                <div className="rounded-xl border border-border p-3">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Μικρότερος
                    </div>
                    <div className="mt-1 font-semibold text-foreground">Δήμος Γαύδου</div>
                    <div className="text-sm text-muted-foreground">142 κάτοικοι</div>
                </div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground">Πηγή: ΕΛΣΤΑΤ, Απογραφή Πληθυσμού 2021</div>
        </figure>
    );
}
