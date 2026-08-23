"use client";

import { useId, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtInt } from "../_lib/format";
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
  value: number;
}

const TONES = {
  orange: { stroke: "#f97316", fillFrom: "#f97316" },
  red: { stroke: "#ef4444", fillFrom: "#ef4444" },
} as const;

function MiniTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MetricPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded border bg-background px-2 py-1 text-[11px] shadow-sm">
      <span className="text-muted-foreground">{point.label}</span>{" "}
      <span className="font-semibold tabular-nums">{fmtInt(point.value)}</span>
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
}: {
  label: string;
  value: string;
  detail: string;
  points: MetricPoint[];
  current: number;
  previous: number;
  invert?: boolean;
  tone?: keyof typeof TONES;
}) {
  const [active, setActive] = useState(false);
  const gradientId = useId();
  const colors = TONES[tone];

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
            <YAxis hide domain={[0, "dataMax"]} allowDecimals={false} />
            <Tooltip
              content={<MiniTooltip />}
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
          <span className="text-2xl font-semibold tabular-nums leading-none">{value}</span>
          <DeltaChip current={current} previous={previous} invert={invert} />
        </div>
        <p className="mt-1.5 truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
