"use client";

import { useId, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtInt, fmtPct } from "../_lib/format";
import { DeltaChip } from "./DeltaChip";

/**
 * A KPI cell with its period series drawn faintly behind the number. On
 * hover the roles swap: the number recedes, the chart comes forward and a
 * cursor tooltip reads out individual days. Without hover (touch) the card
 * is complete as-is — the chart is context, never the only carrier.
 */

export interface MetricPoint {
  /** Unique x value (the bucket key). The tooltip matches points by the x
   *  axis dataKey, and labels repeat — a 24h window starts and ends inside
   *  the same wall-clock hour, so two points share «22:00–23:00» and the
   *  lookup lands on the first one (yesterday's), showing 0 for an hour
   *  that has traffic. */
  key: string;
  /** Tooltip label, e.g. «Σαβ 16/8». */
  label: string;
  /** Null when the bucket has no value to draw — a rate whose denominator is
   *  empty or too thin to carry one. The line breaks there instead of dipping
   *  to zero, which would read as a real "nobody answered". A cumulative
   *  series puts all of its nulls at the front, so its line never breaks. */
  value: number | null;
  /** Extra tooltip context after the value, e.g. the «3/58» a rate came
   *  from. Without it a 100% bucket looks the same at 1 wake and at 100. */
  hint?: string;
}

/** What a point's value counts, which decides how it reads: a rate prints
 *  as a percentage and moves by points, a count prints as an integer. */
type MetricUnit = "count" | "percent";

/** Tabular figures for integers, which they align; never for a rate, whose
 *  el-GR decimal comma takes a digit cell of its own under them. */
function numericClass(unit: MetricUnit): string {
  return unit === "percent" ? "" : "tabular-nums";
}

function fmtPointValue(value: number | null, unit: MetricUnit): string {
  if (value === null) return "—";
  return unit === "percent" ? fmtPct(value / 100, true) : fmtInt(value);
}

/** Ceilings a rate chart snaps to. A rate that moves from 2,4% to 2,6% keeps
 *  the same ceiling, so the line moves and the scale does not. */
const RATE_CEILINGS = [5, 10, 25, 50, 100];

function rateCeiling(points: MetricPoint[]): number {
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  return RATE_CEILINGS.find((c) => max <= c) ?? 100;
}

const TONES = {
  orange: { stroke: "#f97316", fillFrom: "#f97316" },
  red: { stroke: "#ef4444", fillFrom: "#ef4444" },
} as const;

function MiniTooltip({
  active,
  payload,
  unit = "count",
}: {
  active?: boolean;
  payload?: Array<{ payload: MetricPoint }>;
  unit?: MetricUnit;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded border bg-background px-2 py-1 text-[11px] shadow-sm">
      <span className="text-muted-foreground">{point.label}</span>{" "}
      <span className={`font-semibold ${numericClass(unit)}`}>
        {fmtPointValue(point.value, unit)}
      </span>
      {point.hint && <span className="ml-1 tabular-nums text-muted-foreground">{point.hint}</span>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  points,
  current,
  previous,
  invert = false,
  tone = "orange",
  unit = "count",
}: {
  label: string;
  value: string;
  detail: string;
  points: MetricPoint[];
  /** `null` means the period has no value at all, which the chip must not
   *  read as zero: an absent baseline is «νέο», never a rise from nothing. */
  current: number | null;
  previous: number | null;
  invert?: boolean;
  tone?: keyof typeof TONES;
  unit?: MetricUnit;
}) {
  const [active, setActive] = useState(false);
  const gradientId = useId();
  const colors = TONES[tone];
  /** A drawn point whose neighbours are both gaps: the line cannot show it. */
  const isolated = (index: number) =>
    points[index]?.value != null &&
    points[index - 1]?.value == null &&
    points[index + 1]?.value == null;

  return (
    <div
      className="group relative px-5 py-4"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
    >
      {/* the period series — faint context at rest, the surface on hover */}
      <div
        className={`absolute inset-x-1 bottom-1 top-9 transition-opacity duration-200 ${
          active ? "opacity-100" : "opacity-25"
        }`}
        style={{ pointerEvents: active ? "auto" : "none" }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.fillFrom} stopOpacity={0.25} />
                <stop offset="100%" stopColor={colors.fillFrom} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="key" hide />
            {/* A rate at 2–5% against a fixed 0–100 axis is a flat line on
                the floor: true, and unreadable. It gets a ceiling rounded up
                to the next step instead, so the scale holds still while the
                rate wanders inside it and two loads can be compared. Never
                `dataMax`: a series of zeroes would collapse the domain to
                [0,0], which d3 maps to the MIDDLE of the range, and a 0%
                rate would draw halfway up the card. */}
            <YAxis
              hide
              domain={unit === "percent" ? [0, rateCeiling(points)] : [0, "dataMax"]}
              allowDecimals={unit === "percent"}
            />
            <Tooltip
              content={<MiniTooltip unit={unit} />}
              // recharts drops null-valued entries from the payload by
              // default, so an empty bucket drew a cursor over an empty
              // popup — which reads as a broken chart, not as "no rate".
              filterNull={false}
              cursor={{ stroke: colors.stroke, strokeOpacity: 0.35, strokeDasharray: "3 3" }}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={colors.stroke}
              strokeWidth={1.5}
              strokeOpacity={0.8}
              fill={`url(#${gradientId})`}
              // A bucket with null neighbours has no segment to draw — the
              // path is zero-length and paints nothing — so it carries its
              // own dot. Everything else stays dotless: the line is the mark.
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                isolated(props.index ?? -1) ? (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={2}
                    fill={colors.stroke}
                    fillOpacity={0.8}
                  />
                ) : (
                  <g key={props.index} />
                )
              }
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* the number — always legible, receding while the chart is scrubbed */}
      <div
        className={`pointer-events-none relative transition-opacity duration-200 ${
          active ? "opacity-30" : "opacity-100"
        }`}
      >
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="mt-1.5 flex items-baseline gap-2">
          {/* Tabular figures align the integer cards. A rate cannot have them:
              the tabular comma takes a full digit cell in this font, so
              «2,5%» renders as «2 , 5%». `fmtPct(…, true)` pins the decimal
              instead, which is what keeps a rate's width steady. */}
          <span className={`text-2xl font-semibold leading-none ${numericClass(unit)}`}>
            {value}
          </span>
          <DeltaChip current={current} previous={previous} invert={invert} unit={unit} />
        </div>
        <p className="mt-1.5 truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
