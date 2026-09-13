import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { LOCALES, type AppLocale } from '@/i18n/config';
import { getRealm } from '@/lib/realm.server';
import { getPublicExcerpt } from '@/lib/sharing/excerpts';
import { getPublicContribution } from '@/lib/sharing/contributions';
import { getPublicSubject, type PublicMeeting } from '@/lib/sharing/publicContent';
import { parseExcerptSelector, validSourceId } from '@/lib/sharing/excerptSelector';
import { STORY_HEIGHT, STORY_WIDTH } from '@/lib/sharing/story';
import { getLocalizedName } from '@/lib/formatters/name';
import { formatDate } from '@/lib/formatters/time';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { localizeText } from '@/lib/serbian';
import { LOGO_BLACK_DATA_URI, OG_FONTS } from '@/lib/og/serverAssets';
import { getPortraitData } from '@/lib/og/portrait';
import { getSubjectIllustrationData, ILLUSTRATION_BOX } from '@/lib/og/illustration';
import { sharedContext, sharedTopicPill } from '@/lib/og/sharedContent';
import { topicGlyph } from '@/lib/og/topicIcon';
import { topicStyleHex } from '@/lib/topicStyle';
import { ContentStoryImage, type ContentStoryImageProps } from '@/components/og/ContentStoryImage';
import { initialsOf } from '@/components/og/frame';
import { groupExcerptSpeakers } from '@/components/sharing/ExcerptQuote';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

type BandSubject = { id: string; name: string; topic?: { name: string; name_en: string | null; colorHex: string | null; icon: string | null } | null } | null;

/** The illustration band: the subject's picture with its topic and title, or the meeting's name on a neutral wash. */
async function band(subject: BandSubject, meeting: PublicMeeting, locale: string, facts?: string[]): Promise<ContentStoryImageProps['band']> {
    if (!subject) return { src: null, wash: '#e7e5e4', title: getLocalizedName(meeting, locale), facts };
    const colors = topicStyleHex(subject.topic?.colorHex);
    return {
        src: await getSubjectIllustrationData(subject.id, ILLUSTRATION_BOX.band),
        wash: colors.background,
        glyph: topicGlyph(subject.topic?.icon, 160, colors.icon),
        pill: subject.topic ? sharedTopicPill(subject.topic, locale, 24) : undefined,
        title: localizeText(subject.name, locale),
        facts,
    };
}

export async function GET(request: Request) {
    const query = new URL(request.url).searchParams;
    const fail = (status: number, code: string) => Response.json({ code }, { status, headers });
    if ([...query.keys()].some(key => query.getAll(key).length !== 1)) return fail(400, 'invalid');
    const kind = query.get('type');
    if (kind !== 'excerpt' && kind !== 'contribution' && kind !== 'subject') return fail(400, 'invalid');
    const selector = kind === 'excerpt' ? parseExcerptSelector(query) : null;
    const locale = kind === 'excerpt' ? selector?.textLocale : query.get('locale');
    if (!locale || !LOCALES.includes(locale as AppLocale)) return fail(400, 'invalid');
    const realm = await getRealm();
    const t = await getTranslations({ locale, namespace: 'sharing' });
    let meeting: PublicMeeting;
    let content: Pick<ContentStoryImageProps, 'band' | 'label' | 'note' | 'text' | 'passages' | 'attribution' | 'warning'>;

    if (kind === 'excerpt') {
        if (!selector) return fail(400, 'invalid');
        const result = await getPublicExcerpt(selector, realm);
        if (result.status !== 'ok') return fail(result.status === 'source-changed' ? 409 : 404, result.status);
        const { excerpt } = result;
        meeting = excerpt.meeting;
        content = {
            band: await band(excerpt.subject, meeting, locale),
            label: t('excerpt'),
            passages: groupExcerptSpeakers(excerpt.runs).map(group => ({ speakerName: group.speakerName ?? t('unknownSpeaker'), text: group.text })),
            warning: excerpt.isReviewed ? undefined : t('unreviewedNotice'),
        };
    } else if (kind === 'contribution') {
        const id = query.get('id');
        if (!validSourceId(id)) return fail(400, 'invalid');
        const contribution = await getPublicContribution(id, realm, locale);
        if (!contribution) return fail(404, 'unavailable');
        meeting = contribution.meeting;
        const speaker = contribution.speakerName ?? t('unknownSpeaker');
        const [bandData, portrait] = await Promise.all([band(contribution.subject, meeting, locale), getPortraitData(contribution.speakerImage)]);
        content = {
            band: bandData,
            label: t('contribution'),
            note: t('summary'),
            text: localizeText(stripMarkdown(contribution.text), locale),
            attribution: { name: speaker, initials: initialsOf(speaker), image: portrait },
        };
    } else {
        const cityId = query.get('cityId'), meetingId = query.get('meetingId'), subjectId = query.get('subjectId');
        if (!validSourceId(cityId) || !validSourceId(meetingId) || !validSourceId(subjectId)) return fail(400, 'invalid');
        const subject = await getPublicSubject(cityId, meetingId, subjectId, realm);
        if (!subject) return fail(404, 'unavailable');
        meeting = subject.councilMeeting;
        const facts = [meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : getLocalizedName(meeting, locale), formatDate(meeting.dateTime, meeting.city.timezone, locale)];
        content = {
            band: await band(subject, meeting, locale, facts),
            label: t('summary'),
            text: localizeText(stripMarkdown(subject.description ?? ''), locale),
        };
    }

    const context = await sharedContext({ city: meeting.city }, locale);
    const footer = {
        facts: [getLocalizedName(meeting.city, locale), meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : null, formatDate(meeting.dateTime, meeting.city.timezone, locale)].filter((fact): fact is string => Boolean(fact)),
        previewLabel: t('storyPreviewLabel'),
    };
    // Only bounded, source-validated text reaches this renderer; never a full meeting.
    return new ImageResponse(<ContentStoryImage {...content} kind={kind} markSrc={LOGO_BLACK_DATA_URI} locale={locale} context={context} footer={footer} />,
        { width: STORY_WIDTH, height: STORY_HEIGHT, fonts: OG_FONTS, headers });
}
