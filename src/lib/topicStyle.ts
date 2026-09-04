/**
 * The one place a subject topic's colours are decided.
 *
 * A topic is stored as a single hex (Topic.colorHex); everything that shows one has to derive a fill
 * and an icon colour from it. That derivation used to be inlined at every call site with a different
 * alpha suffix each time — `+"20"`, `+"15"`, `${c}1a`, `${c}38` — so the same topic looked like a
 * different topic depending on which surface you were on. This is that derivation, once.
 *
 * Pure and framework-free on purpose: the map's markers are built as plain DOM (outside React), so
 * they can't reach for a component and would otherwise re-invent the recipe a fifth time. React
 * callers should use <TopicIcon>, which is built on this.
 */

/** Topic-less subjects still need a colour; grey reads as "uncategorised" rather than as a topic. */
/**
 * The colour of a subject with no topic, everywhere one renders — pins, dots,
 * chips. Grey reads as 'uncategorised' rather than as a topic; the landing's
 * wire rows and the meeting surfaces must agree on it.
 */
export const TOPICLESS_COLOR = '#9ca3af';

const NEUTRAL = TOPICLESS_COLOR;

/**
 * Black or white — whichever stays readable on `hex`. The topic palette runs from near-black browns
 * to a near-fluorescent yellow, so a fixed white would vanish on the light end: measured against a
 * full-strength fill, white clears the 3:1 an icon needs on only 7 of the 13 topics in use.
 */
export function contrastText(hex: string): string {
    const c = hex.replace('#', '');
    if (c.length < 6) return '#ffffff';
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.62 ? '#0c0a09' : '#ffffff';
}

export type TopicStyle = {
    /** circle / chip fill */
    background: string;
    /** ring around the fill, the topic at full strength */
    border: string;
    /** the icon (or label) sitting on `background` */
    icon: string;
};

/**
 * `soft` is the resting state: a light wash of the topic, ringed in it, with the icon darkened.
 * `solid` is the picked-out state (selected pin, active filter): the topic at full strength, with
 * whichever of black/white survives on it.
 *
 * The soft icon is darkened rather than left at the topic's own colour because most of these hues
 * are mid-to-light: measured against the wash, the raw colour clears the 3:1 an icon needs on only
 * 2 of the 13 topics in use, and white clears it on none. Darkening clears it on all 13.
 *
 * The wash is kept light because it has to work at both extremes — a full-width card header and a
 * 12px map dot. The dot survives it because its ring is the topic at full strength, so the colour is
 * carried by the outline rather than the fill; lightening the fill costs nothing there and buys
 * contrast everywhere else (a darker wash is what pulls Τουρισμός's yellow under 3:1).
 */
export function topicStyle(color?: string | null, variant: 'soft' | 'solid' = 'soft'): TopicStyle {
    const c = color || NEUTRAL;
    if (variant === 'solid') return { background: c, border: c, icon: contrastText(c) };
    return {
        background: `color-mix(in srgb, ${c} 24%, white)`,
        border: c,
        icon: `color-mix(in srgb, ${c} 65%, black)`,
    };
}

/** `color-mix(in srgb, hex weight, other)` as a literal hex, for surfaces that cannot run CSS. */
export function mixHex(hex: string, other: string, weight: number): string {
    const parse = (h: string) => {
        const c = h.replace('#', '');
        return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    };
    const a = parse(hex);
    const b = parse(other);
    const mixed = a.map((v, i) => Math.round(v * weight + b[i] * (1 - weight)));
    return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The `soft` recipe of topicStyle with literal hex values, for an SVG served as
 * an image or an email — places where `color-mix()` cannot run.
 */
export function topicStyleHex(color?: string | null): TopicStyle {
    const c = color || NEUTRAL;
    return {
        background: mixHex(c, '#ffffff', 0.24),
        border: c,
        icon: mixHex(c, '#000000', 0.65),
    };
}
