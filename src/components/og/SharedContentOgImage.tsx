import type { ReactNode } from 'react';
import { storyPreview } from '@/lib/sharing/story';
import { OG, OgAvatar, OgBody, OgChip, OgContextChip, OgEyebrow, OgFrame, OgHeader, OgRow, OgStack, OgTile } from './frame';

/** The subject a shared passage belongs to, as the tile beside it. */
export interface SharedSubjectTile {
    title: string;
    src: string | null;
    wash: string;
    glyph?: ReactNode;
    pill?: ReactNode;
}

/** Who said it, with the party's colour as the ring, as the pages draw a speaker. */
export interface SharedAttribution {
    name: string;
    initials: string;
    detail?: string;
    image?: string | null;
    ring?: string;
}

export interface SharedContentOgImageProps {
    markSrc: string;
    locale: string;
    context?: { text: string; logoSrc?: string | null };
    /** The eyebrow: what kind of content this is. */
    label: string;
    /** The unreviewed-transcript notice, drawn as a chip under the eyebrow. */
    warning?: string;
    /** The AI-summary note, drawn beside the eyebrow. */
    note?: string;
    text: string;
    quote?: boolean;
    /** A passage per speaker when the excerpt spans more than one; replaces `text`. */
    passages?: { speakerName: string; text: string }[];
    additionalSpeakers?: string;
    attribution?: SharedAttribution;
    subject?: SharedSubjectTile;
}

/** A verbatim passage, in the guillemets the pages use — unless the text brought its own. */
export function quoted(text: string): string {
    return text.startsWith('«') && text.endsWith('»') ? text : `«${text}»`;
}

/**
 * A shared excerpt or contribution as an unfurl: the passage on the light
 * ground, where a quote reads best, its speaker under it, and the subject it
 * belongs to as a picture beside it.
 */
export function SharedContentOgImage({ markSrc, locale, context, label, warning, note, text, quote, passages, additionalSpeakers, attribution, subject }: SharedContentOgImageProps) {
    const preview = storyPreview(text, 230);
    return (
        <OgFrame>
            <OgHeader markSrc={markSrc} padBottom={20}>
                {context && <OgContextChip text={context.text} logoSrc={context.logoSrc} />}
            </OgHeader>
            <OgBody
                left={
                    <OgStack gap={0} style={{ width: '100%' }}>
                        <OgRow gap={16}>
                            <OgEyebrow text={label} locale={locale} />
                            {note && (
                                <span style={{ fontSize: 16, color: OG.MUTED }}>{note}</span>
                            )}
                        </OgRow>
                        {warning && (
                            <div style={{ display: 'flex', marginTop: 12 }}>
                                <OgChip tone="warning" size={16}>{warning}</OgChip>
                            </div>
                        )}
                        {passages ? (
                            <OgStack gap={18} style={{ marginTop: 20 }}>
                                {passages.slice(0, 2).map((passage, i) => (
                                    <OgStack key={i} gap={6}>
                                        <div style={{ display: 'block', fontSize: 24, lineHeight: 1.35, color: OG.INK, lineClamp: 3 }}>{quoted(storyPreview(passage.text, 120))}</div>
                                        <span style={{ fontSize: 18, color: OG.MUTED }}>{passage.speakerName}</span>
                                    </OgStack>
                                ))}
                                {additionalSpeakers && <span style={{ fontSize: 16, color: OG.MUTED }}>{additionalSpeakers}</span>}
                            </OgStack>
                        ) : (
                            <div style={{ display: 'block', marginTop: 20, fontSize: quote ? (preview.length > 170 ? 28 : 32) : 27, lineHeight: 1.4, color: quote ? OG.INK : OG.INK_SOFT, maxWidth: 700, lineClamp: 6 }}>
                                {quote ? quoted(preview) : preview}
                            </div>
                        )}
                        {attribution && (
                            <OgRow gap={14} style={{ marginTop: 24 }}>
                                <OgAvatar src={attribution.image} initials={attribution.initials} size={52} ring={attribution.ring ?? OG.BORDER} />
                                <OgStack gap={4}>
                                    <span style={{ fontSize: 22, lineHeight: 1.2, color: OG.INK }}>{attribution.name}</span>
                                    {attribution.detail && <span style={{ fontSize: 18, color: OG.MUTED }}>{attribution.detail}</span>}
                                </OgStack>
                            </OgRow>
                        )}
                    </OgStack>
                }
                right={subject && (
                    <OgTile src={subject.src} title={subject.title} wash={subject.wash} glyph={subject.glyph} pill={subject.pill} width={340} height={194} titleSize={18} />
                )}
            />
        </OgFrame>
    );
}
