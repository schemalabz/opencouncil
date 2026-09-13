import 'server-only';
import type { ReactNode } from 'react';
import { getLocalizedName } from '@/lib/formatters/name';
import { localizeText } from '@/lib/serbian';
import { topicStyleHex } from '@/lib/topicStyle';
import { OgTopicPill } from '@/components/og/frame';
import type { SharedSubjectTile } from '@/components/og/SharedContentOgImage';
import { getSubjectIllustrationData } from './illustration';
import { getImageData, SEAL_BOX, type ImageBox } from './remoteImage';
import { topicGlyph } from './topicIcon';

type SharedTopic = { name: string; name_en: string | null; colorHex: string | null; icon: string | null } | null;
type SharedSubject = { id: string; name: string; topic?: SharedTopic } | null | undefined;
type SharedMeeting = {
    city: { name: string; name_en?: string | null; logoImage?: string | null };
    administrativeBody?: { name: string; name_en: string | null } | null;
};

/** The header chip of a shared-content image: the seal, the city and the body. */
export async function sharedContext(meeting: SharedMeeting, locale: string): Promise<{ text: string; logoSrc: string | null }> {
    const parts = [getLocalizedName(meeting.city, locale)];
    if (meeting.administrativeBody) parts.push(getLocalizedName(meeting.administrativeBody, locale));
    return { text: parts.join(' · '), logoSrc: await getImageData(meeting.city.logoImage, SEAL_BOX) };
}

/** The subject a passage belongs to, as the picture tile beside it; nothing when its meeting gives no clue. */
export async function sharedSubjectTile(subject: SharedSubject, locale: string, box: ImageBox, glyphSize = 64): Promise<SharedSubjectTile | undefined> {
    if (!subject) return undefined;
    const colors = topicStyleHex(subject.topic?.colorHex);
    return {
        title: localizeText(subject.name, locale),
        src: await getSubjectIllustrationData(subject.id, box),
        wash: colors.background,
        glyph: topicGlyph(subject.topic?.icon, glyphSize, colors.icon),
        pill: subject.topic ? sharedTopicPill(subject.topic, locale, 14) : undefined,
    };
}

export function sharedTopicPill(topic: NonNullable<SharedTopic>, locale: string, size: number): ReactNode {
    const colors = topicStyleHex(topic.colorHex);
    return <OgTopicPill name={getLocalizedName(topic, locale)} colors={colors} glyph={topicGlyph(topic.icon, Math.round(size * 1.1), colors.icon)} size={size} />;
}
