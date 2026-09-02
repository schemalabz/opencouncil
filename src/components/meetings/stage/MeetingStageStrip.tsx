'use client';
import type { ComponentType, ReactNode } from 'react';
import { Bell, FileText, ScrollText, Youtube } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { captureEvent } from '@/lib/analytics/capture';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { useNotificationPreference } from '@/contexts/NotificationPreferenceContext';
import { formatClockTime, formatDate, formatDateTime, formatWeekday } from '@/lib/formatters/time';
import { meetingStageExplainHref, type PublicMeetingStage } from '@/lib/meetingStage';
import { cn } from '@/lib/utils';
import { StageRing } from './StageRing';

type StripStage = Exclude<PublicMeetingStage, 'complete'>;

/** The strip's wash. Review shares the transcript banner's yellow: it is the same promise. */
const TINT: Record<StripStage, string> = {
    upcoming: 'border-[hsl(var(--orange))]/25 bg-[hsl(var(--orange))]/[0.06] text-[hsl(var(--orange-deep))]',
    live: 'border-red-600/25 bg-red-600/5 text-red-700',
    waiting: 'border-border bg-muted/70 text-muted-foreground',
    transcribing: 'border-border bg-muted/70 text-muted-foreground',
    review: 'border-yellow-500/50 bg-yellow-50 text-yellow-800',
    archive: 'border-border bg-card text-muted-foreground',
};

type PillVariant = 'outline' | 'primary' | 'live';
const PILL: Record<PillVariant, string> = {
    outline: 'border-border bg-card text-foreground hover:bg-muted',
    primary: 'border-primary bg-primary text-primary-foreground hover:opacity-90',
    live: 'border-red-600 bg-red-600 text-white hover:opacity-90',
};

/** A day and a time the way the strip says them: "Τετάρτη 11 Φεβρουαρίου 2026 στις 15:00". */
function whenText(date: Date, timezone: string, locale: string): string {
    return `${formatWeekday(date, timezone, locale)} ${formatDateTime(date, timezone, 'long', locale)}`;
}

/**
 * The status strip under the meeting header: what the page has at this stage
 * and what it promises next, with the actions that make sense now. Not a card
 * — no rail, no icon disc, no title — the family of the transcript's yellow
 * banner, tinted by stage. Nothing renders once the meeting is complete.
 */
export function MeetingStageStrip({ stage, deadline }: { stage: PublicMeetingStage; deadline: Date | null }) {
    const t = useTranslations('meetingStage');
    const tMeeting = useTranslations('CouncilMeeting');
    const locale = useLocale();
    const { meeting, city, subjects, transcriptHiddenForReview } = useCouncilMeetingData();
    const preference = useNotificationPreference();
    if (stage === 'complete') return null;

    const date = new Date(meeting.dateTime);
    const timezone = city.timezone;
    const channel = meeting.administrativeBody?.youtubeChannelUrl ?? null;
    const video = meeting.youtubeUrl ?? null;
    const explainHref = meetingStageExplainHref(city.realm, stage);
    const track = (action: string) =>
        captureEvent('meeting_page_action', { action, city_id: meeting.cityId, meeting_id: meeting.id, stage });

    const pill = (
        key: string,
        label: string,
        action: string,
        href: string,
        Icon: ComponentType<{ className?: string }>,
        { variant = 'outline', external = false, iconClass }: { variant?: PillVariant; external?: boolean; iconClass?: string } = {},
    ) => (
        <Link
            key={key}
            href={href}
            onClick={() => track(action)}
            {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
            className={cn(
                'inline-flex h-[34px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors hover:no-underline',
                PILL[variant],
            )}
        >
            <Icon className={cn('h-4 w-4 shrink-0', iconClass)} aria-hidden />
            {label}
        </Link>
    );
    const channelPill = channel
        ? pill('channel', t('actions.channel'), 'youtube_channel', channel, Youtube, { external: true, iconClass: 'text-red-600' })
        : null;
    const videoPill = video
        ? pill('video', t('actions.video'), 'youtube_video', video, Youtube, { external: true, iconClass: 'text-red-600' })
        : null;
    const agendaPill = meeting.agendaUrl
        ? pill('agenda', tMeeting('agendaDocument'), 'agenda_pdf', meeting.agendaUrl, FileText, { external: true })
        : null;
    const notifyPill = !city.supportsNotifications
        ? null
        : preference
            ? <span key="notified" className="text-xs text-muted-foreground">{tMeeting('notificationComing')}</span>
            : pill('notifications', t('actions.notifications'), 'notifications', `/${city.id}/notifications`, Bell);
    const liveUrl = video ?? channel;

    let text: ReactNode;
    let actions: ReactNode[];
    switch (stage) {
        case 'upcoming':
            text = t.rich(subjects.length > 0 ? 'strip.upcoming' : 'strip.upcomingNoAgenda', {
                when: whenText(date, timezone, locale),
                b: (chunks: ReactNode) => <strong className="font-semibold">{chunks}</strong>,
            });
            actions = [channelPill, agendaPill, notifyPill];
            break;
        case 'live':
            text = t('strip.live', { time: formatClockTime(date, timezone, locale) });
            actions = [
                liveUrl ? pill('watchLive', t('actions.watchLive'), 'watch_live', liveUrl, Youtube, { variant: 'live', external: true }) : null,
                notifyPill,
            ];
            break;
        case 'waiting':
            text = t('strip.waiting', { date: formatDate(date, timezone, locale) });
            actions = [channelPill, notifyPill];
            break;
        case 'transcribing':
            text = t('strip.transcribing');
            actions = [videoPill ?? channelPill, notifyPill];
            break;
        case 'review': {
            const promise = deadline ? t('strip.reviewBy', { deadline: whenText(deadline, timezone, locale) }) : t('strip.reviewSoon');
            text = (
                <>
                    {t(transcriptHiddenForReview ? 'strip.reviewHidden' : 'strip.review')}{' '}
                    <strong className="font-semibold">{promise}</strong>
                </>
            );
            actions = [
                transcriptHiddenForReview
                    ? null
                    : pill('readTranscript', t('actions.readTranscript'), 'read_transcript', `/${city.id}/${meeting.id}/transcript`, ScrollText, { variant: 'primary' }),
                notifyPill,
            ];
            break;
        }
        case 'archive':
            text = t('strip.archive');
            actions = [videoPill, agendaPill];
            break;
    }
    const shown = actions.filter(Boolean);

    return (
        <div className={cn('mx-auto mb-8 flex max-w-4xl items-start gap-3 rounded-xl border px-4 py-3', TINT[stage])}>
            <StageRing stage={stage} size={20} className="mt-0.5" />
            <div className="min-w-0 flex-1">
                {/* Clock-relative dates; the server and the client may format them a moment apart. */}
                <p className="text-sm leading-relaxed text-foreground" suppressHydrationWarning>{text}</p>
                {(shown.length > 0 || explainHref) && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {shown}
                        {explainHref && (
                            <Link
                                href={explainHref}
                                onClick={() => track('stage_explained')}
                                className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:underline"
                            >
                                {t('explain')}
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
