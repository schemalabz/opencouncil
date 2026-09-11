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
import { SHARING_OG_FONTS } from '@/lib/og/sharingAssets';
import { ContentStoryImage, type ContentStoryImageProps } from '@/components/og/ContentStoryImage';
import { groupExcerptSpeakers } from '@/components/sharing/ExcerptQuote';
import { getPortraitData } from '@/lib/og/portrait';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

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
    let content: Pick<ContentStoryImageProps, 'title' | 'text' | 'speakerName' | 'speakerImage' | 'passages' | 'warning'>;

    if (kind === 'excerpt') {
        if (!selector) return fail(400, 'invalid');
        const result = await getPublicExcerpt(selector, realm);
        if (result.status !== 'ok') return fail(result.status === 'source-changed' ? 409 : 404, result.status);
        const { excerpt } = result;
        meeting = excerpt.meeting;
        content = {
            title: excerpt.subject?.name ?? getLocalizedName(meeting, locale),
            passages: groupExcerptSpeakers(excerpt.runs).map(group => ({ speakerName: group.speakerName ?? t('unknownSpeaker'), text: group.text })),
            warning: excerpt.isReviewed ? undefined : t('unreviewedNotice'),
        };
    } else if (kind === 'contribution') {
        const id = query.get('id');
        if (!validSourceId(id)) return fail(400, 'invalid');
        const contribution = await getPublicContribution(id, realm, locale);
        if (!contribution) return fail(404, 'unavailable');
        meeting = contribution.meeting;
        content = {
            title: localizeText(contribution.subject.name, locale),
            text: localizeText(stripMarkdown(contribution.text), locale),
            speakerName: contribution.speakerName ?? t('unknownSpeaker'),
            speakerImage: await getPortraitData(contribution.speakerImage),
        };
    } else {
        const cityId = query.get('cityId'), meetingId = query.get('meetingId'), subjectId = query.get('subjectId');
        if (!validSourceId(cityId) || !validSourceId(meetingId) || !validSourceId(subjectId)) return fail(400, 'invalid');
        const subject = await getPublicSubject(cityId, meetingId, subjectId, realm);
        if (!subject) return fail(404, 'unavailable');
        meeting = subject.councilMeeting;
        content = { title: localizeText(subject.name, locale), text: localizeText(stripMarkdown(subject.description ?? ''), locale) };
    }

    // Only bounded, source-validated text reaches this renderer; never a full meeting.
    return new ImageResponse(<ContentStoryImage {...content} kind={kind}
        label={t(kind === 'subject' ? 'storySubject' : kind === 'contribution' ? 'contribution' : 'excerpt')}
        summaryLabel={t('summary')} previewLabel={t('storyPreviewLabel')}
        city={getLocalizedName(meeting.city, locale)} date={formatDate(meeting.dateTime, meeting.city.timezone, locale)}
        administrativeBody={meeting.administrativeBody ? getLocalizedName(meeting.administrativeBody, locale) : undefined}
    />, { width: STORY_WIDTH, height: STORY_HEIGHT, fonts: SHARING_OG_FONTS, headers });
}
