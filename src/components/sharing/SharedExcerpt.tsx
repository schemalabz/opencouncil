import { ArrowUpRight, FileText, Play } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { formatDate } from '@/lib/formatters/time';
import { getLocalizedName } from '@/lib/formatters/name';
import type { PublicExcerpt } from '@/lib/sharing/excerpts';
import { transcriptExcerptPath } from '@/lib/sharing/excerptSelector';
import { ExcerptQuote } from './ExcerptQuote';
import { SharePageShell } from './SharePageShell';
import { TranscriptReviewNotice } from './TranscriptReviewNotice';
import { SharingViewTracker, SharingSourceLink } from '@/components/analytics/SharingTracker';
import type { SharingContext } from '@/lib/analytics/sharing';

export async function SharedExcerpt({ excerpt, locale }: { excerpt: PublicExcerpt; locale: string }) {
    const t = await getTranslations({ locale, namespace: 'sharing' });
    const { meeting, selector } = excerpt;
    const transcriptUrl = transcriptExcerptPath(selector, excerpt.startTimestamp);
    const analytics: SharingContext = { content_type: 'excerpt', surface: 'shared_excerpt', city_id: meeting.cityId, meeting_id: meeting.id, subject_id: excerpt.subject?.id, locale, reviewed: excerpt.isReviewed, utterance_count: excerpt.runs.length };
    return <SharePageShell locale={locale}>
        <SharingViewTracker analytics={analytics} />
        <p className="text-xs font-semibold tracking-wide text-[hsl(var(--orange-deep))] dark:text-[hsl(var(--orange))]">{t('excerpt')}</p>
        <h1 className="mt-3 text-balance text-2xl font-normal leading-tight tracking-tight sm:text-3xl">{excerpt.subject?.name ?? getLocalizedName(meeting, locale)}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{getLocalizedName(meeting.city, locale)}<span className="mx-2">·</span>{formatDate(meeting.dateTime, meeting.city.timezone, locale)}</p>
        {!excerpt.isReviewed && <div className="mt-6"><TranscriptReviewNotice text={t('unreviewedNotice')} /></div>}
        <div className="my-8 border-y py-8 sm:my-10 sm:py-10">
            {excerpt.before && <p className="mb-6 text-base leading-7 text-muted-foreground">…{excerpt.before}</p>}
            <ExcerptQuote runs={excerpt.runs} unknownSpeaker={t('unknownSpeaker')} />
            {excerpt.after && <p className="mt-6 text-base leading-7 text-muted-foreground">{excerpt.after}…</p>}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
            <SharingSourceLink analytics={analytics} action="listen" href={transcriptUrl} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-90"><Play className="size-4" />{t('listen')}</SharingSourceLink>
            <SharingSourceLink analytics={analytics} action="open_transcript" href={transcriptUrl} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition-colors hover:bg-muted"><FileText className="size-4" />{t('fullTranscript')}<ArrowUpRight className="size-4" /></SharingSourceLink>
        </div>
    </SharePageShell>;
}
