// _registry/foundations.tsx  ('use client' NOT allowed — keep hook-free; static preview JSX + strings)
import type { ReactNode } from 'react';

export type FoundationKind = 'branding' | 'palette' | 'typography';

export interface FoundationItem {
    id: string;
    name: string;
    preview: ReactNode;
    /** snippet for the "Code" prompt */
    code: string;
    /** styles / usage for the "Design" prompt */
    design: string;
}

// ── Branding ──────────────────────────────────────────────────────────────
function Logo({ src, dark = false }: { src: string; dark?: boolean }) {
    return (
        <div className={`flex h-16 items-center justify-center rounded-md border ${dark ? 'bg-[#1c1917]' : 'bg-white'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="OpenCouncil logo" className="max-h-10 w-auto" />
        </div>
    );
}

export const BRANDING: FoundationItem[] = [
    {
        id: 'logo', name: 'Logo', preview: <Logo src="/logo.png" />,
        code: `<img src="/logo.png" alt="OpenCouncil" />`,
        design: 'Primary OpenCouncil wordmark/mark on light surfaces. Keep clear space; never recolour.',
    },
    {
        id: 'logo-white', name: 'Logo (white)', preview: <Logo src="/white-logo.png" dark />,
        code: `<img src="/white-logo.png" alt="OpenCouncil" />`,
        design: 'White logo for dark surfaces (e.g. Graphite #1c1917). Use only where contrast demands it.',
    },
    {
        id: 'square', name: 'Square mark', preview: <Logo src="/square.png" />,
        code: `<img src="/square.png" alt="OpenCouncil" />`,
        design: 'Square / social mark — favicons, avatars, app tiles.',
    },
    {
        id: 'theme', name: 'Brand lockup', preview: <Logo src="/oc-theme.png" />,
        code: `<img src="/oc-theme.png" alt="OpenCouncil" />`,
        design: 'Brand lockup over the warm/cool orb background — the marketing aesthetic reference.',
    },
];

// ── Palette ───────────────────────────────────────────────────────────────
function Swatch({ hex, dark = false }: { hex: string; dark?: boolean }) {
    return <div className={`h-12 w-full rounded-md border ${dark ? 'border-white/20' : ''}`} style={{ backgroundColor: hex }} />;
}

interface ColorDef { id: string; name: string; hex: string; token: string; design: string; dark?: boolean }

const COLORS: ColorDef[] = [
    { id: 'civic-flame', name: 'Civic Flame', hex: '#ff6600', token: '--orange (24 100% 50%)', design: 'Primary actions, links, inline emphasis, highlights only. Rarity keeps it loud — never backgrounds or resting chrome; ≤10% of a screen.' },
    { id: 'flame-deep', name: 'Civic Flame Deep', hex: '#fc550a', token: '--gradient-orange (16 97% 52%)', design: 'Hot end of the brand gradient; inline `em` emphasis; the 15% transcript-highlight tint. Never a standalone fill.' },
    { id: 'marble-blue', name: 'Marble Blue', hex: '#a4c0e1', token: '--accent (212 50% 76%)', design: 'Secondary buttons, 10% hover washes, cool end of the gradient. Cools the flame, never competes with it.' },
    { id: 'ink', name: 'Ink', hex: '#0c0a09', token: '--foreground', dark: true, design: 'Body text and focus rings. Warm near-black, never pure black.' },
    { id: 'graphite', name: 'Graphite', hex: '#1c1917', token: '--primary', dark: true, design: 'Dark fills — default badges, skip-link, primary-on-dark contexts.' },
    { id: 'ink-soft', name: 'Soft Ink', hex: '#78716c', token: '--muted-foreground', design: 'Secondary text, placeholders, captions. Passes 4.5:1 on white — never lighten further.' },
    { id: 'stone-mist', name: 'Stone Mist', hex: '#f5f5f4', token: '--secondary / --muted', design: 'Quiet panel and chip backgrounds; the second neutral layer behind sidebars and toolbars.' },
    { id: 'cloud-border', name: 'Cloud Border', hex: '#e7e5e4', token: '--border / --input', design: 'Hairline borders and input strokes — the structural line of the whole system.' },
    { id: 'paper', name: 'Paper', hex: '#ffffff', token: '--background / --card', design: 'The default surface. The glass walls are white.' },
    { id: 'paper-warm', name: 'Warm Paper', hex: '#fafaf9', token: '--primary-foreground', design: 'Text on dark fills.' },
    { id: 'signal-red', name: 'Signal Red', hex: '#ef4444', token: '--destructive', design: 'Destructive actions and errors only. Never decorative.' },
];

const GRADIENT_CSS = 'linear-gradient(90deg, #fc550a, #a4c0e1, #fc550a)';

export const PALETTE: FoundationItem[] = [
    ...COLORS.map((c) => ({
        id: c.id,
        name: c.name,
        preview: (
            <div className="space-y-1">
                <Swatch hex={c.hex} dark={c.dark} />
                <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{c.hex}</span>
                    <span className="font-mono text-muted-foreground">{c.token.split(' ')[0]}</span>
                </div>
            </div>
        ),
        code: `${c.hex}  /* ${c.token} → hsl(var(${c.token.split(' ')[0]})) */`,
        design: c.design,
    })),
    {
        id: 'brand-gradient', name: 'Brand gradient',
        preview: <div className="h-12 w-full rounded-md border" style={{ background: GRADIENT_CSS }} />,
        code: `background: ${GRADIENT_CSS};`,
        design: 'The one sanctioned gradient: Civic Flame Deep → Marble Blue → back. Permitted on 1–1.5px borders (card hover, gradient button) and brand moments only — never on text or as a surface fill.',
    },
];

// ── Typography ────────────────────────────────────────────────────────────
interface TypeDef { id: string; name: string; sample: string; style: React.CSSProperties; tw: string; design: string }

const UI_FONT = "'Relative Book Pro', Inter, sans-serif";

const TYPE: TypeDef[] = [
    { id: 'headline', name: 'Headline', sample: 'Ο Δήμος σου, απλά', style: { fontFamily: UI_FONT, fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.025em' }, tw: 'text-2xl font-semibold tracking-tight', design: 'Card titles and section headings. Relative Book Pro, 24px/600.' },
    { id: 'title', name: 'Title', sample: 'Δημοτικό Συμβούλιο', style: { fontFamily: UI_FONT, fontSize: '1.125rem', fontWeight: 500, lineHeight: 1.4 }, tw: 'text-lg font-medium', design: 'Sub-headings and the desktop breadcrumb. 18px/500.' },
    { id: 'body', name: 'Body', sample: 'Η συνεδρίαση ξεκίνησε στις 18:00.', style: { fontFamily: UI_FONT, fontSize: '1rem', fontWeight: 400, lineHeight: 1.5 }, tw: 'text-base', design: 'Default prose. 16px/400; cap measure at 65–75ch.' },
    { id: 'label', name: 'Label', sample: 'Αναζήτηση', style: { fontFamily: UI_FONT, fontSize: '0.875rem', fontWeight: 500, lineHeight: 1.4 }, tw: 'text-sm font-medium', design: 'Buttons, inputs, navigation, form labels — the working UI size. 14px/500.' },
    { id: 'transcript', name: 'Transcript (record)', sample: '«…και το αίτημα εγκρίνεται ομόφωνα.»', style: { fontFamily: "Roboto, sans-serif", fontSize: '1rem', fontWeight: 400, lineHeight: 1.5 }, tw: 'font-["Roboto"] text-base', design: 'The verbatim record (Roboto, 16px/1.5). Two Voices Rule: never set the record in the UI font or the UI in Roboto.' },
    { id: 'mono', name: 'Mono', sample: '00:12:45', style: { fontFamily: "'Roboto Mono', monospace", fontSize: '0.875rem', fontWeight: 400 }, tw: 'font-mono text-sm', design: 'Timestamps, IDs, code. Roboto Mono, 14px.' },
];

export const TYPOGRAPHY: FoundationItem[] = TYPE.map((t) => ({
    id: t.id,
    name: t.name,
    preview: <span style={t.style}>{t.sample}</span>,
    code: `/* ${t.name} */ className="${t.tw}"  —  ${String(t.style.fontFamily)}, ${t.style.fontSize}, ${t.style.fontWeight}`,
    design: t.design,
}));
