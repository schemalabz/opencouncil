import { z } from "zod";
import { preferenceLocationSchema } from "./schemas";

/**
 * Deterministic geography for wake assembly. Distances between subjects and
 * the reader's pinned places are computed here, in the shell — never by the
 * model — and rendered into the wake input as ready-made facts.
 */

export type PreferenceLocation = z.infer<typeof preferenceLocationSchema>;

export function locationText(location: PreferenceLocation): string {
  return typeof location === "string" ? location : location.text;
}

export function locationCoords(
  location: PreferenceLocation,
): { lng: number; lat: number } | null {
  if (typeof location === "string") return null;
  if (location.lng == null || location.lat == null) return null;
  // (0,0) is the tokenless address-search fallback, not a real place.
  if (location.lng === 0 && location.lat === 0) return null;
  return { lng: location.lng, lat: location.lat };
}

export function haversineMeters(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Greek, coarse on purpose: «400 μ», «2,1 χλμ», «12 χλμ». */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} μ`;
  const km = meters / 1000;
  return km < 10
    ? `${km.toFixed(1).replace(".", ",")} χλμ`
    : `${Math.round(km)} χλμ`;
}

/**
 * One line per subject with a mapped location: its distance to each of the
 * reader's coordinate-bearing places. Null when nothing is computable.
 */
export function distanceLine(
  subject: { lng: number; lat: number },
  places: Array<{ text: string; lng: number; lat: number }>,
): string | null {
  if (places.length === 0) return null;
  const parts = places.map(
    (p) => `${formatDistance(haversineMeters(subject, p))} από «${p.text}»`,
  );
  return parts.join(" · ");
}
