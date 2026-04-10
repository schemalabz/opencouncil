/**
 * Embed widget theme utilities.
 *
 * Derives a full color palette from a single accent hex color + light/dark mode.
 */

const DEFAULT_ACCENT = '#3b82f6'; // A sensible blue

function hexToRgb(hex: string): [number, number, number] {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    let r: number, g: number, b: number;
    if (s === 0) {
        r = g = b = l;
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export interface EmbedThemeVars {
    '--embed-accent': string;
    '--embed-accent-light': string;
    '--embed-accent-dark': string;
    '--embed-bg': string;
    '--embed-card-bg': string;
    '--embed-card-hover': string;
    '--embed-text': string;
    '--embed-text-muted': string;
    '--embed-border': string;
    '--embed-radius': string;
}

export type EmbedMode = 'light' | 'dark';
export type EmbedRadius = 'sharp' | 'rounded' | 'pill';

const RADIUS_MAP: Record<EmbedRadius, string> = {
    sharp: '0px',
    rounded: '8px',
    pill: '16px',
};

export function parseAccentColor(raw: string | null | undefined): string {
    if (!raw) return DEFAULT_ACCENT;
    const cleaned = raw.startsWith('#') ? raw : `#${raw}`;
    // Validate hex
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cleaned)) return cleaned;
    return DEFAULT_ACCENT;
}

export function generateThemeVars(
    accent: string,
    mode: EmbedMode = 'light',
    radius: EmbedRadius = 'rounded',
): EmbedThemeVars {
    const [r, g, b] = hexToRgb(accent);
    const [h, s, l] = rgbToHsl(r, g, b);

    const accentLight = hslToHex(h, s, Math.min(l + 0.15, 0.9));
    const accentDark = hslToHex(h, s, Math.max(l - 0.15, 0.15));

    if (mode === 'dark') {
        return {
            '--embed-accent': accent,
            '--embed-accent-light': accentLight,
            '--embed-accent-dark': accentDark,
            '--embed-bg': '#1a1a1a',
            '--embed-card-bg': '#262626',
            '--embed-card-hover': '#333333',
            '--embed-text': '#e5e5e5',
            '--embed-text-muted': '#a3a3a3',
            '--embed-border': '#404040',
            '--embed-radius': RADIUS_MAP[radius],
        };
    }

    return {
        '--embed-accent': accent,
        '--embed-accent-light': accentLight,
        '--embed-accent-dark': accentDark,
        '--embed-bg': '#ffffff',
        '--embed-card-bg': '#ffffff',
        '--embed-card-hover': '#f5f5f5',
        '--embed-text': '#1a1a1a',
        '--embed-text-muted': '#737373',
        '--embed-border': '#e5e5e5',
        '--embed-radius': RADIUS_MAP[radius],
    };
}
