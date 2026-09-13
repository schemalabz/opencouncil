import type { ReactNode } from 'react';
import { storyPreview } from '@/lib/sharing/story';
import { OG, OgAvatar, OgBrand, OgContextChip, OgEyebrow, OgFacts, OgFoot, OgRow, OgStack, OgTitle } from './frame';
import { quoted, type SharedAttribution } from './SharedContentOgImage';

export interface ContentStoryImageProps {
    kind: 'subject' | 'contribution' | 'excerpt';
    markSrc: string;
    locale: string;
    context?: { text: string; logoSrc?: string | null };
    /** The illustration band under the header: the subject's picture, its topic and its title. */
    band: { src: string | null; wash: string; glyph?: ReactNode; pill?: ReactNode; title: string; facts?: string[] };
    /** The eyebrow over the body: what this is. */
    label: string;
    /** The AI-summary note, drawn as a small line with the eyebrow. */
    note?: string;
    text?: string;
    passages?: { speakerName: string; text: string }[];
    attribution?: SharedAttribution;
    warning?: string;
    footer: { facts: string[]; previewLabel: string };
}

const BAND_HEIGHT = { subject: 640, contribution: 440, excerpt: 440 } as const;

/**
 * A subject, a contribution or an excerpt as an Instagram story: the same
 * frame the unfurls use, stretched tall. The lockup and the seal at the top,
 * the illustration as a band, the text at story scale, the source at the foot.
 */
export function ContentStoryImage({ kind, markSrc, locale, context, band, label, note, text, passages, attribution, warning, footer }: ContentStoryImageProps) {
    const bandHeight = BAND_HEIGHT[kind];
    const summary = text ? storyPreview(text, kind === 'subject' ? 520 : 400) : '';
    return (
        <div style={{ display: 'flex', position: 'relative', flexDirection: 'column', width: OG.STORY_WIDTH, height: OG.STORY_HEIGHT, overflow: 'hidden', background: OG.GROUND, color: OG.INK, fontFamily: OG.FONT }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '72px 64px 40px' }}>
                <OgBrand markSrc={markSrc} size={34} />
                {context ? <OgContextChip text={context.text} logoSrc={context.logoSrc} size={26} /> : <div style={{ display: 'flex' }} />}
            </div>
            <div style={{ display: 'flex', position: 'relative', width: OG.STORY_WIDTH, height: bandHeight, overflow: 'hidden', background: band.wash }}>
                {band.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={band.src} width={OG.STORY_WIDTH} height={bandHeight} alt="" style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
                ) : band.glyph && (
                    <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: OG.STORY_WIDTH, height: bandHeight, alignItems: 'center', justifyContent: 'center' }}>{band.glyph}</div>
                )}
                <OgFoot padding="160px 64px 48px">
                    {band.pill}
                    <div style={{ display: 'flex', marginTop: 18 }}>
                        <OgTitle size={kind === 'subject' ? 56 : 44} color="#ffffff" maxWidth={950} lines={3}>{band.title}</OgTitle>
                    </div>
                    {band.facts && band.facts.length > 0 && (
                        <div style={{ display: 'flex', marginTop: 18 }}><OgFacts items={band.facts} size={26} color="rgba(255,255,255,0.85)" /></div>
                    )}
                </OgFoot>
            </div>
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 28, padding: '56px 64px 0' }}>
                <OgRow gap={16}>
                    <OgEyebrow text={label} locale={locale} size={22} />
                    {note && <span style={{ fontSize: 22, color: OG.MUTED }}>{note}</span>}
                </OgRow>
                {warning && (
                    <div style={{ display: 'flex', padding: '20px 24px', background: '#fdf1e6', borderRadius: 16, color: '#8b350e', fontSize: 24, lineHeight: 1.45 }}>{warning}</div>
                )}
                {attribution && (
                    <OgRow gap={22}>
                        <OgAvatar src={attribution.image} initials={attribution.initials} size={120} ring={attribution.ring ?? OG.BORDER} />
                        <OgStack gap={8}>
                            <span style={{ fontSize: 40, lineHeight: 1.15, color: OG.INK }}>{attribution.name}</span>
                            {attribution.detail && <span style={{ fontSize: 26, color: OG.MUTED }}>{attribution.detail}</span>}
                        </OgStack>
                    </OgRow>
                )}
                {passages ? (
                    <OgStack gap={40}>
                        {passages.slice(0, 2).map((passage, i) => (
                            <OgStack key={i} gap={18}>
                                <div style={{ display: 'flex', fontSize: passages.length > 1 ? 40 : 46, lineHeight: 1.32, color: OG.INK, lineClamp: passages.length > 1 ? 5 : 9 }}>
                                    {quoted(storyPreview(passage.text, passages.length > 1 ? 180 : 420))}
                                </div>
                                <OgRow gap={16} style={{ fontSize: 28, color: OG.MUTED }}>
                                    <span style={{ width: 32, height: 3, background: OG.ORANGE }} />
                                    <span>{passage.speakerName}</span>
                                </OgRow>
                            </OgStack>
                        ))}
                    </OgStack>
                ) : summary && (
                    <div style={{ display: 'flex', fontSize: kind === 'subject' ? 36 : 38, lineHeight: 1.4, color: OG.INK_SOFT, lineClamp: 11 }}>{summary}</div>
                )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '40px 64px 0', padding: '40px 0 96px', borderTop: `1px solid ${OG.BORDER}` }}>
                <OgFacts items={footer.facts} size={26} />
                <span style={{ fontSize: 24, color: OG.MUTED }}>{footer.previewLabel}</span>
            </div>
        </div>
    );
}
