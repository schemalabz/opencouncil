'use client';

import { Trash2, Landmark, ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { captureLandingAction } from '@/lib/landing/analytics';
import { topicStyle } from '@/lib/topicStyle';

const PIN_BLUE = '#2A6FDB';
const SAMPLE_COLOR = '#16a34a'; // green — the sample "Καθαριότητα" topic (pin + preview card)
const SLATE = '#5b6b8c'; // the general/city-hall marker colour (see createGeneralCityMarker)

/* The "?" info drawer body: what the map is, a stylised preview with the real marker types, a
   legend tying each marker to its meaning, and a link to /explain. Responsive (desktop + mobile). */
export function InfoPanel() {
    const t = useTranslations('landingV2');
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-muted/40 px-4 py-4">
            <p className="text-sm leading-relaxed text-foreground/80">{t('info.intro')}</p>

            <MapMock />

            {/* legend — each glyph is a replica of the matching marker in the mock above */}
            <div className="flex flex-col gap-3.5">
                <LegendRow glyph={<TopicPin color={SAMPLE_COLOR} />} title={t('info.pins.title')} body={t('info.pins.body')} />
                <LegendRow glyph={<TopicPin color={PIN_BLUE} extra={1} />} title={t('info.cluster.title')} body={t('info.cluster.body')} />
                <LegendRow glyph={<GeneralMarker count={3} />} title={t('info.general.title')} body={t('info.general.body')} />
            </div>

            {/* learn-more → /explain (no card — just the copy + button) */}
            <div className="mt-1 flex flex-col gap-3">
                <p className="text-sm leading-relaxed text-foreground/80">{t('info.moreBody')}</p>
                <Link
                    href="/explain"
                    onClick={() => captureLandingAction('info_explain_clicked', {})}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--orange))] px-4 py-2.5 text-sm font-semibold text-white no-underline shadow-sm transition hover:brightness-95 hover:no-underline"
                >
                    {t('info.moreCta')} <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        </div>
    );
}

/* Non-interactive illustration of the map: soft basemap with the three marker types and a
   floating subject preview on the highlighted (green) pin. */
function MapMock() {
    const t = useTranslations('landingV2');
    return (
        <div className="relative aspect-[4/3] w-full shrink-0 select-none overflow-hidden rounded-xl border border-black/10 bg-gradient-to-br from-muted to-background shadow-inner">
            <svg className="absolute inset-0 h-full w-full text-foreground/10" aria-hidden>
                <defs>
                    <pattern id="info-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                        <path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="1" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#info-grid)" />
                <path d="M-10 130 Q 130 80 320 160" fill="none" stroke="currentColor" strokeWidth="10" opacity="0.6" />
                <path d="M70 -10 Q 100 120 50 260" fill="none" stroke="currentColor" strokeWidth="8" opacity="0.6" />
            </svg>

            <Placed x="20%" y="72%"><TopicPin color={PIN_BLUE} extra={1} /></Placed>
            <Placed x="80%" y="68%"><GeneralMarker count={3} /></Placed>
            <Placed x="46%" y="54%"><TopicPin color={SAMPLE_COLOR} /></Placed>

            {/* floating preview card, anchored above the highlighted pin */}
            <div className="absolute left-[31%] top-[6%] w-[62%] max-w-[220px] overflow-hidden rounded-lg border border-black/10 bg-card text-left shadow-lg">
                <div
                    className="px-2 py-1 text-[10px] font-bold"
                    style={{ backgroundColor: `color-mix(in srgb, ${SAMPLE_COLOR} 12%, white)`, color: SAMPLE_COLOR }}
                >
                    {t('info.sampleTopic')}
                </div>
                <div className="flex flex-col gap-1 px-2 py-1.5">
                    <span className="line-clamp-2 text-[12px] font-bold leading-tight text-foreground">{t('info.sampleSubject')}</span>
                    <span className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{t('info.sampleDesc')}</span>
                    <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-[hsl(var(--orange))]">
                        {t('subject.view')} <ArrowRight className="h-2.5 w-2.5" />
                    </span>
                </div>
            </div>
        </div>
    );
}

/* absolute-centres its child at (x, y) within the mock */
function Placed({ x, y, children }: { x: string; y: string; children: ReactNode }) {
    return (
        <span className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
            {children}
        </span>
    );
}

function LegendRow({ glyph, title, body }: { glyph: ReactNode; title: string; body: string }) {
    return (
        <div className="flex gap-3">
            <span className="mt-0.5 shrink-0">{glyph}</span>
            <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">{title}</span>
                <span className="text-sm leading-snug text-muted-foreground">{body}</span>
            </div>
        </div>
    );
}

/* Replica of the real topic pin (createSubjectPin / stylePin): a tinted circle with the topic
   icon; `extra` adds the orange "+N" badge of a co-located group. */
function TopicPin({ color, extra }: { color: string; extra?: number }) {
    // Draw from topicStyle so the legend stays honest with the real pin (createSubjectPin / stylePin):
    // same wash, same ring, same darkened icon — not a hand-tuned copy that drifts when the pin changes.
    const s = topicStyle(color, 'soft');
    return (
        <span className="relative inline-flex shrink-0">
            <span
                className="flex h-8 w-8 items-center justify-center rounded-full shadow-md"
                style={{ backgroundColor: s.background, border: `1.5px solid ${s.border}` }}
            >
                <Trash2 color={s.icon} size={15} />
            </span>
            {extra != null && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-[hsl(var(--orange))] px-1 text-[10px] font-bold leading-none text-white shadow">
                    +{extra}
                </span>
            )}
        </span>
    );
}

/* Replica of the general/δήμος marker (createGeneralCityMarker): a slate Landmark square with a
   count badge — for a municipality's non-located subjects. */
function GeneralMarker({ count }: { count?: number }) {
    return (
        <span className="relative inline-flex shrink-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-white bg-white shadow-md">
                <Landmark size={16} color={SLATE} />
            </span>
            {count != null && (
                <span
                    className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white px-1 text-[10px] font-bold leading-none text-white shadow"
                    style={{ backgroundColor: SLATE }}
                >
                    {count}
                </span>
            )}
        </span>
    );
}
