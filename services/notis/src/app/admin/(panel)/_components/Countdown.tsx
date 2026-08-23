"use client";

import { useEffect, useState } from "react";

/**
 * A live countdown: remaining time as text plus a draining bar. The bar
 * measures the window from `start` (or first render) to `target`, so a
 * five-minute poller interval visibly empties over five minutes. Past-due
 * targets show `overdueLabel` with a full bar in the warn tint.
 *
 * Ticks every second while mounted; renders a stable placeholder until the
 * client takes over, so server HTML never disagrees with the first paint.
 */

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}μ ${hours}ω`;
  if (hours > 0) return `${hours}ω ${minutes}′`;
  if (minutes > 0) return `${minutes}′ ${String(seconds).padStart(2, "0")}″`;
  return `${seconds}″`;
}

export function Countdown({
  target,
  start,
  overdueLabel = "τώρα",
  prefix,
  className = "",
}: {
  /** ISO instant the countdown runs toward. */
  target: string;
  /** ISO instant the window opened; the bar drains from here. Absent: the
   *  bar measures from the moment the component mounted. */
  start?: string;
  overdueLabel?: string;
  /** Rendered before the time, e.g. "σε". */
  prefix?: string;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const targetMs = new Date(target).getTime();
  const startMs = start ? new Date(start).getTime() : mountedAt;

  // Pre-hydration placeholder: structure without numbers.
  if (now === null) {
    return (
      <span className={`inline-flex flex-col gap-1 ${className}`}>
        <span className="text-xs tabular-nums text-muted-foreground">—</span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-muted" />
      </span>
    );
  }

  const remaining = targetMs - now;
  const overdue = remaining <= 0;
  const total = Math.max(1, targetMs - startMs);
  const fraction = overdue ? 0 : Math.min(1, Math.max(0, remaining / total));

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <span
        className={`text-xs tabular-nums ${overdue ? "font-medium text-orange" : "text-muted-foreground"}`}
      >
        {overdue ? overdueLabel : `${prefix ? `${prefix} ` : ""}${formatRemaining(remaining)}`}
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full rounded-full transition-[width] duration-1000 ease-linear ${
            overdue ? "w-full bg-orange/80" : "bg-orange/60"
          }`}
          style={overdue ? undefined : { width: `${fraction * 100}%` }}
        />
      </span>
    </span>
  );
}
