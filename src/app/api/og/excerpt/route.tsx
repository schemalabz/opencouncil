import { getTranslations } from 'next-intl/server';
import { getRealm } from '@/lib/realm.server';
import { getPublicExcerpt } from '@/lib/sharing/excerpts';
import { parseExcerptSelector } from '@/lib/sharing/excerptSelector';
import { getInitials } from '@/lib/formatters/name';
import { formatDate } from '@/lib/formatters/time';
import { LOGO_BLACK_DATA_URI, OG_FONTS } from '@/lib/og/serverAssets';
import { ILLUSTRATION_BOX } from '@/lib/og/illustration';
import { sharedContext, sharedSubjectTile } from '@/lib/og/sharedContent';
import { SharedContentOgImage } from '@/components/og/SharedContentOgImage';
import { renderImage, shareCacheControl } from '@/lib/og/render';
import { groupExcerptSpeakers } from '@/components/sharing/ExcerptQuote';
import { meetingLabelInCity } from '@/lib/meetingName';
import { sharedSpeakerName } from '@/lib/sharing/speakerName';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Pairs with the render slot: a hung render must not hold it forever.
export const maxDuration = 60;
export async function GET(request: Request) {
    const selector = parseExcerptSelector(new URL(request.url).searchParams);
    const locale = selector?.textLocale ?? 'el';
    const [t, tTranscript] = await Promise.all([getTranslations({ locale, namespace: 'sharing' }), getTranslations({ locale, namespace: 'transcript' })]);
    const labels = { unknownSpeaker: t('unknownSpeaker'), unverified: tTranscript('unverifiedSpeaker.label') };
    const result = selector ? await getPublicExcerpt(selector, await getRealm()) : null;
    const excerpt = result?.status === 'ok' ? result.excerpt : null;
    const groups = excerpt ? groupExcerptSpeakers(excerpt.runs) : [];
    const [context, subject] = excerpt
        ? await Promise.all([sharedContext(excerpt.meeting, locale), sharedSubjectTile(excerpt.subject, locale, ILLUSTRATION_BOX.tile)])
        : [undefined, undefined];
    const single = groups.length === 1 ? groups[0].speakerName ?? t('unknownSpeaker') : null;
    const singleName = groups.length === 1 ? sharedSpeakerName(groups[0].speakerName, groups[0].speakerUnverified, labels) : null;
    return renderImage(<SharedContentOgImage
        markSrc={LOGO_BLACK_DATA_URI}
        locale={locale}
        context={context}
        label={t('excerpt')}
        warning={excerpt && !excerpt.isReviewed ? t('unreviewedLabel') : undefined}
        text={excerpt ? excerpt.runs.map(run => run.text).join(' ') : t('unavailableTitle')}
        quote={!!excerpt}
        passages={groups.length > 1 ? groups.map(group => ({ speakerName: sharedSpeakerName(group.speakerName, group.speakerUnverified, labels), text: group.text })) : undefined}
        additionalSpeakers={groups.length > 2 ? t('additionalPassages', { count: groups.length - 2 }) : undefined}
        attribution={excerpt && single && singleName ? {
            name: singleName,
            initials: getInitials(single),
            detail: formatDate(excerpt.meeting.dateTime, excerpt.meeting.city.timezone, locale),
        } : undefined}
        // A passage with no subject clue in its meeting names the meeting as its context instead.
        subject={subject ?? (excerpt ? { title: meetingLabelInCity(excerpt.meeting, locale), src: null, wash: '#e7e5e4' } : undefined)}
    />, { width: 1200, height: 630, fonts: OG_FONTS, headers: { 'Cache-Control': shareCacheControl() } });
}
