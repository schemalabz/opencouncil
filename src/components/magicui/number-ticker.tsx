"use client";

import { useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "framer-motion";

import { cn } from "@/lib/utils";

const numberFormatterNoGrouping = new Intl.NumberFormat("en-US", { useGrouping: false });
const numberFormatterWithGrouping = new Intl.NumberFormat("en-US");

export default function NumberTicker({
  value,
  direction = "up",
  delay = 0,
  className,
  useGrouping = true,
}: {
  value: number;
  direction?: "up" | "down";
  className?: string;
  delay?: number; // delay in s
  useGrouping?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(direction === "down" ? value : 0);
  const springValue = useSpring(motionValue, {
    damping: 40,
    stiffness: 200,
    restDelta: 0.5,
  });
  const isInView = useInView(ref, { once: true, margin: "0px" });
  const formatter = useGrouping ? numberFormatterWithGrouping : numberFormatterNoGrouping;

  useEffect(() => {
    isInView &&
      setTimeout(() => {
        motionValue.set(direction === "down" ? 0 : value);
      }, delay * 1000);
  }, [motionValue, isInView, delay, value, direction]);

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) {
          ref.current.textContent = formatter.format(
            Number(latest.toFixed(0)),
          );
        }
      }),
    [springValue, formatter],
  );

  return (
    <span
      className={cn(
        "inline-block tabular-nums text-black dark:text-white tracking-wider",
        className,
      )}
      ref={ref}
    />
  );
}
