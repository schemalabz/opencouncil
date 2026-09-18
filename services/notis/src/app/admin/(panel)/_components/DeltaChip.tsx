import { type Delta, deltaFor } from "../_lib/metrics";

/**
 * Change versus the previous period. `invert` flips the coloring for
 * metrics where growth is bad (unsubscribes, failures, cost). No "use
 * client": pure, renders on either side of the boundary.
 *
 * The decision lives in `deltaFor`, where the test project can reach it —
 * this file is a `.tsx` and jest here runs `.ts` only. A rate is passed and
 * rendered as a fraction, and reported in percentage points: 4,8% becoming
 * 2,5% is 2,3 points, and calling it «48% down» describes a difference of
 * five replies as a collapse.
 *
 * No `tabular-nums`. The el-GR decimal comma takes a full digit cell under
 * tabular figures in this font, which renders «2,3 μον.» as «2 , 3 μον.»,
 * and this chip prints a decimal on nearly every value it shows.
 */
export function DeltaChip({
  current,
  previous,
  invert = false,
  unit = "count",
}: {
  /** `null` means the period has no value — which is not the same as zero. */
  current: number | null;
  previous: number | null;
  invert?: boolean;
  /** `percent` takes the two values as fractions (0,025 = 2,5%). */
  unit?: "count" | "percent";
}) {
  const base = "rounded px-1.5 py-0.5 text-[11px] font-medium";
  const delta: Delta = deltaFor({ current, previous, unit, invert });
  if (delta.kind === "none") {
    return <span className={`${base} text-muted-foreground/60`}>—</span>;
  }
  if (delta.kind === "new") {
    return <span className={`${base} bg-muted text-muted-foreground`}>νέο</span>;
  }
  if (delta.kind === "flat") {
    return <span className={`${base} bg-muted text-muted-foreground`}>=</span>;
  }
  const cls = delta.improving ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  const magnitude = delta.magnitude.toLocaleString("el-GR", {
    maximumFractionDigits: delta.magnitude >= 10 ? 0 : 1,
  });
  return (
    <span className={`${base} ${cls}`} title="σε σχέση με την προηγούμενη περίοδο">
      {delta.up ? "↑" : "↓"} {magnitude}
      {delta.unit === "points" ? " μον." : "%"}
    </span>
  );
}
