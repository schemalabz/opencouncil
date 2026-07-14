import { Link } from "@/i18n/routing";
import { formatDate } from "@/lib/formatters/time";
import type { AdministrativeBodyType } from "@prisma/client";
import type { CoverageRow } from "@/lib/db/coverage";

const TYPE_LABEL: Record<AdministrativeBodyType, string> = {
    council: "Δημοτικά Συμβούλια",
    committee: "Δημοτικές Επιτροπές",
    community: "Δημοτικές Κοινότητες",
};

/** "Έως" is always the present. */
const NOW_LABEL = "Τώρα";

interface CityGroup {
    cityId: string;
    cityName: string;
    items: CoverageRow[];
}

/** Rows arrive sorted by city then body type — collapse them into per-city groups. */
function groupByCity(rows: CoverageRow[]): CityGroup[] {
    const groups: CityGroup[] = [];
    for (const r of rows) {
        const last = groups[groups.length - 1];
        if (last && last.cityId === r.cityId) last.items.push(r);
        else groups.push({ cityId: r.cityId, cityName: r.cityName, items: [r] });
    }
    return groups;
}

function CityLink({ cityId, cityName }: { cityId: string; cityName: string }) {
    return (
        <Link
            href={`/${cityId}`}
            className="unstyled font-medium text-foreground transition-colors hover:text-orange"
        >
            {cityName}
        </Link>
    );
}

const NowBadge = () => (
    <span className="inline-flex items-center rounded-full border border-orange/30 bg-orange/5 px-2.5 py-1 text-xs font-medium text-orange">
        {NOW_LABEL}
    </span>
);

/**
 * Coverage matrix for the /explain "Κάλυψη" subsection: municipalities grouped
 * with a sub-row per administrative body type — the date public coverage started
 * ("Από") through the present ("Έως" = Τώρα). A table on ≥sm (city spans its body
 * rows), stacked per-city cards on mobile. Data comes from {@link getCityCoverage}.
 */
export function CityCoverageTable({ rows }: { rows: CoverageRow[] }) {
    const groups = groupByCity(rows);

    return (
        <div className="not-prose">
            {/* desktop / tablet: table with the city cell spanning its body rows */}
            <div className="hidden overflow-x-auto rounded-2xl border border-border sm:block">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="border-b border-border bg-muted/40 text-left">
                            <th className="px-4 py-3 font-semibold text-foreground">Δήμος</th>
                            <th className="px-4 py-3 font-semibold text-foreground">Όργανο</th>
                            <th className="px-4 py-3 font-semibold text-foreground">Από</th>
                            <th className="px-4 py-3 font-semibold text-foreground">Έως</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((g) =>
                            g.items.map((r, i) => {
                                const isLast = i === g.items.length - 1;
                                return (
                                    <tr
                                        key={`${r.cityId}-${r.bodyType}`}
                                        className={isLast ? "border-b border-border last:border-0" : undefined}
                                    >
                                        {i === 0 && (
                                            <td
                                                rowSpan={g.items.length}
                                                className="whitespace-nowrap border-r border-border px-4 py-3 align-top"
                                            >
                                                <CityLink cityId={g.cityId} cityName={g.cityName} />
                                            </td>
                                        )}
                                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                            {TYPE_LABEL[r.bodyType]}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                            {formatDate(new Date(r.fromDate), r.cityTimezone)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            <NowBadge />
                                        </td>
                                    </tr>
                                );
                            }),
                        )}
                    </tbody>
                </table>
            </div>

            {/* mobile: one card per city, body types listed inside */}
            <ul className="space-y-3 sm:hidden">
                {groups.map((g) => (
                    <li key={g.cityId} className="rounded-2xl border border-border p-4">
                        <div className="text-base">
                            <CityLink cityId={g.cityId} cityName={g.cityName} />
                        </div>
                        <ul className="mt-3 space-y-2.5">
                            {g.items.map((r) => (
                                <li key={r.bodyType} className="text-sm">
                                    <div className="font-medium text-foreground">{TYPE_LABEL[r.bodyType]}</div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                                        <span>
                                            <span className="text-foreground">Από:</span>{" "}
                                            {formatDate(new Date(r.fromDate), r.cityTimezone)}
                                        </span>
                                        <span aria-hidden>·</span>
                                        <span>
                                            <span className="text-foreground">Έως:</span> {NOW_LABEL}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
        </div>
    );
}
