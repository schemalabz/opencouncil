import { fmtInt } from "../_lib/format";

/**
 * The readout every chart on the overview pops on hover: the bucket's
 * label, the value, then what the value counts. recharts hands the hovered
 * row in as `payload`.
 */
export function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; value: number } }>;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded border bg-background px-2 py-1 text-[11px] shadow-sm">
      <span className="text-muted-foreground">{point.label}</span>{" "}
      <span className="font-semibold tabular-nums">{fmtInt(point.value)}</span>
      {unit && <span className="text-muted-foreground"> {unit}</span>}
    </div>
  );
}
