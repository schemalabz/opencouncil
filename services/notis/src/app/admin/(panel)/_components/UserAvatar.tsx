"use client";

import { Facehash } from "facehash";

/**
 * Deterministic face avatar (facehash: local SVG, same seed → same face).
 * Seed with the main-database userId everywhere — names collide and
 * subscription ids can be recreated. Palette
 * stays in the panel's family: brand orange plus warm stone tones.
 */
const PALETTE = ["#f97316", "#fb923c", "#d97706", "#78716c", "#57534e"];

export function UserAvatar({ seed, size = 32 }: { seed: string; size?: number }) {
  return (
    <Facehash
      name={seed}
      size={size}
      colors={PALETTE}
      className="shrink-0 rounded-full"
    />
  );
}
