import type { CSSProperties, ReactNode } from 'react';
import { getIntlLocale } from '@/lib/formatters/time';

/**
 * The one frame every Open Graph image and story image is drawn in.
 *
 * Tokens are the site's own, resolved to plain values because satori reads
 * no CSS variables: the warm ground, the ink and muted ink, the hairline and
 * the brand orange from `packages/ui/src/styles/tokens.css`. Every element
 * sets `display: flex`, which satori requires of any box with children, and
 * nothing here imports Node modules, so a client-side rasterizer could draw
 * the same frame.
 */
export const OG = {
    WIDTH: 1200,
    HEIGHT: 630,
    STORY_WIDTH: 1080,
    STORY_HEIGHT: 1920,
    PAD: 56,
    GROUND: '#fafaf9',
    INK: '#0c0a09',
    INK_SOFT: 'rgba(12,10,9,0.8)',
    MUTED: '#78716c',
    BORDER: '#e7e5e4',
    ORANGE: '#ff6600',
    ORANGE_INK: '#b83d05',
    TILE_RADIUS: 16,
    FOOT: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.5) 50%, rgba(0,0,0,0))',
    FONT: "'Relative Book Pro', Inter, sans-serif",
} as const;

const flex: CSSProperties = { display: 'flex' };

export function OgFrame({ children, width = OG.WIDTH, height = OG.HEIGHT, ground = OG.GROUND }: {
    children: ReactNode; width?: number; height?: number; ground?: string;
}) {
    return (
        <div style={{ ...flex, position: 'relative', flexDirection: 'column', width, height, overflow: 'hidden', background: ground, color: OG.INK, fontFamily: OG.FONT }}>
            {children}
        </div>
    );
}

/** Butterfly + wordmark: the mark 1.8x the wordmark's size and never bold, as the site header and the PDFs draw it. */
export function OgBrand({ markSrc, size = 26, white = false }: { markSrc: string; size?: number; white?: boolean }) {
    const markWidth = Math.round(size * 1.8);
    const markHeight = Math.round(markWidth * 646 / 777);
    return (
        <div style={{ ...flex, alignItems: 'center', gap: Math.round(size * 0.45), fontSize: size, lineHeight: 1, color: white ? '#ffffff' : OG.INK }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markSrc} width={markWidth} height={markHeight} alt="" style={{ objectFit: 'contain' }} />
            <span>OpenCouncil</span>
        </div>
    );
}

/** The city seal and where you are, the way the site header's breadcrumb says it. */
export function OgContextChip({ text, logoSrc, size = 22, white = false }: { text: string; logoSrc?: string | null; size?: number; white?: boolean }) {
    const seal = Math.round(size * 2);
    return (
        <div style={{ ...flex, alignItems: 'center', gap: 12, fontSize: size, lineHeight: 1.2, color: white ? 'rgba(255,255,255,0.85)' : OG.MUTED }}>
            {logoSrc && (
                <div style={{ ...flex, width: seal, height: seal, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 9999, background: '#ffffff', padding: 3 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoSrc} width={seal - 6} height={seal - 6} alt="" style={{ objectFit: 'contain' }} />
                </div>
            )}
            <span>{text}</span>
        </div>
    );
}

/** The top row: the lockup at the left, the context (or anything else) at the right. */
export function OgHeader({ markSrc, children, padBottom = 0, white = false }: { markSrc: string; children?: ReactNode; padBottom?: number; white?: boolean }) {
    return (
        <div style={{ ...flex, alignItems: 'center', justifyContent: 'space-between', gap: 24, padding: `${OG.PAD - 12}px ${OG.PAD}px ${padBottom}px` }}>
            <OgBrand markSrc={markSrc} white={white} />
            {children ?? <div style={flex} />}
        </div>
    );
}

/** The body under the header: a text column at the left and, optionally, something at the right. */
export function OgBody({ left, right, gap = 40, align = 'center' }: { left: ReactNode; right?: ReactNode; gap?: number; align?: 'center' | 'flex-start' }) {
    return (
        <div style={{ ...flex, flex: 1, alignItems: align, gap, padding: `0 ${OG.PAD}px ${OG.PAD}px` }}>
            <div style={{ ...flex, minWidth: 0, flex: 1, flexDirection: 'column', alignItems: 'flex-start' }}>{left}</div>
            {right}
        </div>
    );
}

/**
 * Uppercase for the renderer. satori's `textTransform` is a plain `toUpperCase`,
 * which keeps the tonos on Greek capitals (ΣΥΝΕΔΡΊΑΣΗ); the locale-aware form
 * drops it and keeps the dialytika, as the pages' CSS does in a browser.
 */
export function ogUppercase(text: string, locale: string): string {
    return text.toLocaleUpperCase(getIntlLocale(locale));
}

export function OgEyebrow({ text, locale, size = 16, color = OG.ORANGE }: { text: string; locale: string; size?: number; color?: string }) {
    return <div style={{ ...flex, fontSize: size, lineHeight: 1, letterSpacing: '0.14em', color }}>{ogUppercase(text, locale)}</div>;
}

/** satori rejects an undefined style value, so the optional width joins the style only when set. */
export function OgTitle({ children, size = 52, color = OG.INK, maxWidth, lines = 2 }: { children: ReactNode; size?: number; color?: string; maxWidth?: number | string; lines?: number }) {
    const width = maxWidth === undefined ? {} : { maxWidth };
    return <div style={{ ...flex, fontSize: size, lineHeight: 1.15, letterSpacing: '-0.01em', color, lineClamp: lines, ...width }}>{children}</div>;
}

/** Facts on one line, separated by the middle dot the pages use. */
export function OgFacts({ items, size = 22, color = OG.MUTED }: { items: string[]; size?: number; color?: string }) {
    return (
        <div style={{ ...flex, flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: size, lineHeight: 1.3, color }}>
            {items.map((item, i) => (
                <div key={i} style={{ ...flex, alignItems: 'center', gap: 12 }}>
                    {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
                    <span style={{ whiteSpace: 'nowrap' }}>{item}</span>
                </div>
            ))}
        </div>
    );
}

/** A topic named as a pill: its wash, its ring, its glyph, at image scale. `glyph` is the rendered SVG. */
export function OgTopicPill({ name, colors, glyph, size = 20 }: { name: string; colors: { background: string; border: string; icon: string }; glyph: ReactNode; size?: number }) {
    return (
        <div style={{ ...flex, alignItems: 'center', gap: 8, borderRadius: 9999, border: `1.5px solid ${colors.border}`, padding: `${Math.round(size * 0.4)}px ${Math.round(size * 0.7)}px`, fontSize: size, lineHeight: 1, whiteSpace: 'nowrap', background: colors.background, color: colors.icon }}>
            {glyph}
            <span>{name}</span>
        </div>
    );
}

export type OgChipTone = 'neutral' | 'orange' | 'success' | 'warning';
const CHIP_TONES: Record<OgChipTone, { background: string; border: string; color: string }> = {
    neutral: { background: '#ffffff', border: OG.BORDER, color: OG.INK },
    orange: { background: 'rgba(255,102,0,0.06)', border: 'rgba(255,102,0,0.35)', color: OG.ORANGE_INK },
    success: { background: '#e6f4ea', border: '#e6f4ea', color: '#1b6b3a' },
    warning: { background: '#fdf1e6', border: '#fdf1e6', color: '#8b350e' },
};

export function OgChip({ children, tone = 'neutral', size = 18 }: { children: ReactNode; tone?: OgChipTone; size?: number }) {
    const t = CHIP_TONES[tone];
    return (
        <div style={{ ...flex, alignItems: 'center', gap: 8, borderRadius: 9999, border: `1px solid ${t.border}`, background: t.background, padding: `${Math.round(size * 0.45)}px ${Math.round(size * 0.8)}px`, fontSize: size, lineHeight: 1, whiteSpace: 'nowrap', color: t.color }}>
            {children}
        </div>
    );
}

export function OgChips({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
    return <div style={{ ...flex, flexWrap: 'wrap', gap }}>{children}</div>;
}

/** The dark gradient foot text sits on when it sits on a picture. */
export function OgFoot({ children, padding = '96px 56px 40px' }: { children: ReactNode; padding?: string }) {
    return <div style={{ ...flex, position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'column', alignItems: 'flex-start', padding, background: OG.FOOT, color: '#ffffff' }}>{children}</div>;
}

/**
 * One subject as a picture with its title on the foot: the landing card's hero
 * at thumbnail scale. Without a picture, the topic's wash and glyph, as the
 * pages draw the placeholder.
 */
export function OgTile({ src, title, wash, glyph, width, height, titleSize = 17, pill }: {
    src: string | null; title?: string; wash: string; glyph?: ReactNode; width: number; height: number; titleSize?: number; pill?: ReactNode;
}) {
    return (
        <div style={{ ...flex, position: 'relative', width, height, overflow: 'hidden', borderRadius: OG.TILE_RADIUS, background: wash }}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} width={width} height={height} alt="" style={{ position: 'absolute', top: 0, left: 0, width, height, objectFit: 'cover' }} />
            ) : glyph && (
                <div style={{ ...flex, position: 'absolute', top: 0, left: 0, width, height, alignItems: 'center', justifyContent: 'center' }}>{glyph}</div>
            )}
            {title && (
                <OgFoot padding={`${Math.round(height * 0.42)}px 16px 14px`}>
                    {pill}
                    <div style={{ ...flex, fontSize: titleSize, lineHeight: 1.25, color: '#ffffff', lineClamp: 2 }}>{title}</div>
                </OgFoot>
            )}
        </div>
    );
}

/** Tiles in rows: `columns` per row, all the same size. */
export function OgTileGrid({ children, columns = 2, width, gap = 12 }: { children: ReactNode; columns?: number; width: number; gap?: number }) {
    return <div style={{ ...flex, flexWrap: 'wrap', gap, width: columns * width + (columns - 1) * gap }}>{children}</div>;
}

/** A portrait in a ring of the party's colour, or the initials where there is no portrait. */
export function OgAvatar({ src, initials, size = 64, ring = OG.BORDER }: { src?: string | null; initials: string; size?: number; ring?: string }) {
    const ringWidth = Math.max(2, Math.round(size * 0.06));
    return (
        <div style={{ ...flex, width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 9999, background: '#f5f5f4', border: `${ringWidth}px solid ${ring}` }}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} width={size} height={size} alt="" style={{ objectFit: 'cover' }} />
            ) : (
                <span style={{ fontSize: Math.round(size * 0.36), color: OG.MUTED }}>{initials}</span>
            )}
        </div>
    );
}

/** Two-line headline, the second line in the brand orange, for the site's own pages. */
export function OgHeadline({ top, bottom, size = 56 }: { top: string; bottom: string; size?: number }) {
    return (
        <div style={{ ...flex, flexDirection: 'column', gap: 4, fontSize: size, lineHeight: 1.15, letterSpacing: '-0.015em' }}>
            <span style={{ color: OG.INK }}>{top}</span>
            <span style={{ color: OG.ORANGE }}>{bottom}</span>
        </div>
    );
}

export function OgStack({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
    return <div style={{ ...flex, flexDirection: 'column', alignItems: 'flex-start', gap, ...style }}>{children}</div>;
}

export function OgRow({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
    return <div style={{ ...flex, alignItems: 'center', gap, ...style }}>{children}</div>;
}

export function initialsOf(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase();
}
