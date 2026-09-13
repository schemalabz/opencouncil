import 'server-only';
import type { ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import { getMeetingDataForOG } from '@/lib/db/meetings';
import { getSubjectsForMeetingCached, getSubjectStatisticsCached } from '@/lib/cache/queries';
import { LOGO_BLACK_DATA_URI } from '@/lib/og/serverAssets';
import { getImageData, SEAL_BOX } from '@/lib/og/remoteImage';
import { getSubjectIllustrationData, ILLUSTRATION_BOX } from '@/lib/og/illustration';
import { topicGlyph } from '@/lib/og/topicIcon';
import { topicStyleHex } from '@/lib/topicStyle';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDate } from '@/lib/formatters/time';
import { localizeText } from '@/lib/serbian';
import { OG, OgContextChip, OgFacts, OgFoot, OgFrame, OgHeader, OgTitle, OgTopicPill } from '@/components/og/frame';

export const SUBJECT_OG_SIZE = { width: 1200, height: 630 };

/** The header row: the lockup (39px) or the seal chip (44px), whichever is taller, inside its padding. */
const HEADER_HEIGHT = 44 + 44 + 24;
const HERO_HEIGHT = SUBJECT_OG_SIZE.height - HEADER_HEIGHT;

/**
 * The subject page's own header, as an unfurl: the illustration edge to edge
 * under the site's chrome, the topic and the title on its foot. Without an
 * illustration, the topic's wash and glyph, as the page draws the placeholder.
 *
 * `settled` is false when the illustration was not there yet, or the subject
 * was not found: the cache then keeps the image for an hour, not a year. The
 * page's opengraph-image.tsx and /api/og both render this element.
 */
export async function subjectOgElement(locale: string, cityId: string, meetingId: string, subjectId: string): Promise<{ element: ReactElement; settled: boolean }> {
    const t = await getTranslations({ locale, namespace: 'og' });
    const [meeting, subjects] = await Promise.all([
        getMeetingDataForOG(cityId, meetingId),
        getSubjectsForMeetingCached(cityId, meetingId),
    ]);
    const subject = subjects.find(s => s.id === subjectId);

    if (!meeting || !subject) {
        return {
            settled: false,
            element: (
                <OgFrame>
                    <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={24} />
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: `0 ${OG.PAD}px ${OG.PAD}px` }}>
                        <OgTitle size={44} color={OG.MUTED}>{t('subject.notFound')}</OgTitle>
                    </div>
                </OgFrame>
            ),
        };
    }

    const [statisticsRecord, illustration, seal] = await Promise.all([
        getSubjectStatisticsCached(cityId, meetingId, subjects, meeting.dateTime),
        getSubjectIllustrationData(subject.id, ILLUSTRATION_BOX.hero),
        getImageData(meeting.city.logoImage, SEAL_BOX),
    ]);
    const statistics = statisticsRecord[subject.id];
    // statistics.speakingSeconds, as the subject page counts it.
    const minutes = Math.round((statistics?.speakingSeconds ?? 0) / 60);
    const speakers = statistics?.people?.length ?? 0;
    const colors = topicStyleHex(subject.topic?.colorHex);
    const context = [getLocalizedName(meeting.city, locale), meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null]
        .filter(Boolean).join(' · ');
    const facts = [formatDate(new Date(meeting.dateTime), meeting.city.timezone, locale)];
    if (speakers > 0) facts.push(t('subject.speakers', { count: speakers }));
    if (minutes > 0) facts.push(t('subject.discussion', { minutes }));

    return {
        settled: illustration !== null,
        element: (
            <OgFrame>
                <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={24}>
                    <OgContextChip text={context} logoSrc={seal} />
                </OgHeader>
                <div style={{ display: 'flex', position: 'relative', width: SUBJECT_OG_SIZE.width, height: HERO_HEIGHT, overflow: 'hidden', background: colors.background }}>
                    {illustration ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={illustration} width={SUBJECT_OG_SIZE.width} height={HERO_HEIGHT} alt="" style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
                    ) : (
                        <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: SUBJECT_OG_SIZE.width, height: HERO_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
                            {topicGlyph(subject.topic?.icon, 160, colors.icon)}
                        </div>
                    )}
                    <OgFoot padding={`120px ${OG.PAD}px 44px`}>
                        {subject.topic && (
                            <OgTopicPill
                                name={getLocalizedName(subject.topic, locale)}
                                colors={colors}
                                glyph={topicGlyph(subject.topic.icon, 22, colors.icon)}
                            />
                        )}
                        <div style={{ display: 'flex', marginTop: 16 }}>
                            <OgTitle size={52} color="#ffffff" maxWidth={1000}>{localizeText(subject.name, locale)}</OgTitle>
                        </div>
                        <div style={{ display: 'flex', marginTop: 16 }}>
                            <OgFacts items={facts} color="rgba(255,255,255,0.85)" />
                        </div>
                    </OgFoot>
                </div>
            </OgFrame>
        ),
    };
}
