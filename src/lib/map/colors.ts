/** Perceived-luminance helpers for text on topic-colored fills. */

export function isLightColor(hex: string): boolean {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return false;
    const value = parseInt(match[1], 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.66;
}

/** Ink on light topic colors, white on dark ones. */
export function contrastTextColor(hex: string): string {
    return isLightColor(hex) ? '#0c0a09' : '#ffffff';
}
