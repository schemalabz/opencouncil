"use client";

import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CURRENT_PERIOD, PREVIOUS_PERIOD } from "../_lib/chart-colors";
import { fmtInt } from "../_lib/format";
import { ChartTooltip } from "./ChartTooltip";

/**
 * One row of the overview's trend block: a series across the previous period
 * and the current one, previous in gray and current in orange, so a change
 * reads as a shape and not only as a chip. Every row shares a `syncId`, so
 * one hover reads out all of them at the same bucket. The divider between
 * the periods is drawn by the row, not here: it is layout, and the chart has
 * no axes to hang it on.
 */

export interface TrendPoint {
  /** Unique x value (the bucket key). Labels repeat — a two-period 24h
   *  window holds every wall-clock hour twice — so the axis matches on it. */
  key: string;
  /** Tooltip label, e.g. «Σαβ 16/8». */
  label: string;
  value: number;
}

interface TrendProps {
  points: TrendPoint[];
  /** Index of the first bucket of the current period. */
  boundaryIndex: number;
  /** What a value counts, for the tooltip: «αναγνώστες», «συνδρομητές». */
  unit: string;
}

const PREVIOUS = PREVIOUS_PERIOD;
const CURRENT = CURRENT_PERIOD;
const INK = "#18181b";
const MUTED = "#71717a";
const SURFACE = "#ffffff";
const NO_MARGIN = { top: 0, right: 0, left: 0, bottom: 0 };

/**
 * Per-bucket counts as columns, one per bucket, coloured by period. Rows
 * that count the same thing pass the same `max`, so a row that is a subset
 * of another draws shorter — on its own scale every row peaks at the top.
 */
export function TrendColumns({
  points,
  boundaryIndex,
  unit,
  max,
}: TrendProps & { max: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={NO_MARGIN} syncId="trend" barCategoryGap={2}>
        <XAxis dataKey="key" hide />
        {/* Never a bare `dataMax`: a series of zeroes collapses the domain to
            [0,0], which d3 maps to the middle of the range. */}
        <YAxis hide domain={[0, Math.max(max, 1)]} allowDecimals={false} />
        <Tooltip
          content={<ChartTooltip unit={unit} />}
          cursor={{ fill: INK, fillOpacity: 0.04 }}
          isAnimationActive={false}
        />
        <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {points.map((point, index) => (
            <Cell key={point.key} fill={index < boundaryIndex ? PREVIOUS : CURRENT} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * A level as a line, with the last value of each period marked and labelled.
 * The y range hugs the values instead of starting at zero: a list that grew
 * from 300 to 500 is the story, and against a zero floor it is a gentle
 * slope. That is why the two end labels are always on — without an axis
 * they are what the reader has.
 */
export function TrendLine({ points, boundaryIndex, unit }: TrendProps) {
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const domain: [number, number] = [
    Math.max(0, Math.floor(min - span * 0.35)),
    Math.ceil(max + span * 0.35),
  ];
  // Every bucket belongs to one period, but a level line drawn in two
  // pieces would break at the seam. The orange one reaches back to the last
  // previous bucket to close the gap, rather than the gray one reaching
  // forward: that segment is the level moving THROUGH the first current
  // bucket, which is current-period growth.
  const data = points.map((point, index) => ({
    ...point,
    previous: index < boundaryIndex ? point.value : null,
    current: index >= boundaryIndex - 1 ? point.value : null,
  }));
  const previousEnd = boundaryIndex > 0 ? points[boundaryIndex - 1] : undefined;
  const currentEnd = points[points.length - 1];
  const mark = (point: TrendPoint, fill: string, strong: boolean) => (
    <ReferenceDot
      x={point.key}
      y={point.value}
      r={4}
      fill={fill}
      stroke={SURFACE}
      strokeWidth={2}
      label={{
        value: fmtInt(point.value),
        position: "top",
        fontSize: 11,
        fontWeight: strong ? 600 : 400,
        fill: strong ? INK : MUTED,
      }}
    />
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={NO_MARGIN} syncId="trend">
        {/* «gap» puts the points at band centres, where the column rows put
            their bars, so one hover lands on the same bucket in every row. */}
        <XAxis dataKey="key" hide padding="gap" />
        <YAxis hide domain={domain} />
        <Tooltip
          content={<ChartTooltip unit={unit} />}
          cursor={{ stroke: MUTED, strokeOpacity: 0.4 }}
          isAnimationActive={false}
        />
        <Line
          dataKey="previous"
          stroke={PREVIOUS}
          strokeWidth={2}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="current"
          stroke={CURRENT}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
        />
        {previousEnd && mark(previousEnd, PREVIOUS, false)}
        {currentEnd && mark(currentEnd, CURRENT, true)}
      </LineChart>
    </ResponsiveContainer>
  );
}
