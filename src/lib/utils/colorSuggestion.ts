/**
 * Color utilities for suggesting a hex color that is visually distinct
 * from a set of existing colors.
 */

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb | null {
    const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
    if (!match) return null;
    const raw = match[1];
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    return [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
    ];
}

function hslToHex(h: number, s: number, l: number): string {
    const sn = s / 100;
    const ln = l / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const hPrime = h / 60;
    const x = c * (1 - Math.abs((hPrime % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (hPrime < 1) [r, g, b] = [c, x, 0];
    else if (hPrime < 2) [r, g, b] = [x, c, 0];
    else if (hPrime < 3) [r, g, b] = [0, c, x];
    else if (hPrime < 4) [r, g, b] = [0, x, c];
    else if (hPrime < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = ln - c / 2;
    const toHex = (v: number) =>
        Math.round((v + m) * 255)
            .toString(16)
            .padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Returns a hex color that maximizes the minimum RGB distance to every
 * color in `existing`. Candidates are sampled along the hue circle at a
 * fixed saturation and lightness so the result always looks reasonable.
 * If `existing` is empty, returns a random saturated color.
 */
export function suggestDistinctColor(existing: string[]): string {
    const existingRgb: Rgb[] = [];
    for (const hex of existing) {
        const rgb = hexToRgb(hex);
        if (rgb) existingRgb.push(rgb);
    }

    const SATURATION = 70;
    const LIGHTNESS = 50;
    const CANDIDATES = 64;

    if (existingRgb.length === 0) {
        return hslToHex(Math.floor(Math.random() * 360), SATURATION, LIGHTNESS);
    }

    let bestHex = hslToHex(0, SATURATION, LIGHTNESS);
    let bestMinDist = -1;

    for (let i = 0; i < CANDIDATES; i++) {
        const hue = (i / CANDIDATES) * 360;
        const hex = hslToHex(hue, SATURATION, LIGHTNESS);
        const rgb = hexToRgb(hex)!;

        let minDist = Infinity;
        for (const e of existingRgb) {
            const dr = rgb[0] - e[0];
            const dg = rgb[1] - e[1];
            const db = rgb[2] - e[2];
            const dist = dr * dr + dg * dg + db * db;
            if (dist < minDist) minDist = dist;
        }

        if (minDist > bestMinDist) {
            bestMinDist = minDist;
            bestHex = hex;
        }
    }

    return bestHex;
}
