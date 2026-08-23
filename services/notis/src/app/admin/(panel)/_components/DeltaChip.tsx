import { pctChange } from "../_lib/metrics";

/**
 * Change versus the previous period. `invert` flips the coloring for
 * metrics where growth is bad (unsubscribes, failures, cost). No "use
 * client": pure, renders on either side of the boundary.
 */
export function DeltaChip({
  current,
  previous,
  invert = false,
}: {
  current: number;
  previous: number;
  invert?: boolean;
}) {
  const base = "rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums";
  if (current === 0 && previous === 0) {
    return <span className={`${base} text-muted-foreground/60`}>—</span>;
  }
  const pct = pctChange(current, previous);
  if (pct === null) {
    return <span className={`${base} bg-muted text-muted-foreground`}>νέο</span>;
  }
  if (Math.abs(pct) < 0.5) {
    return <span className={`${base} bg-muted text-muted-foreground`}>=</span>;
  }
  const improving = invert ? pct < 0 : pct > 0;
  const cls = improving ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  const magnitude = Math.abs(pct).toLocaleString("el-GR", {
    maximumFractionDigits: Math.abs(pct) >= 10 ? 0 : 1,
  });
  return (
    <span className={`${base} ${cls}`} title="σε σχέση με την προηγούμενη περίοδο">
      {pct > 0 ? "↑" : "↓"} {magnitude}%
    </span>
  );
}
