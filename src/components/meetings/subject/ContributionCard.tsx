"use client";

import { memo, useEffect, useRef } from "react";
import { useContributionBarHover, useSpeakerBarHover } from '@/components/meetings/bar/BarHighlightContext';
import { captureEvent } from '@/lib/analytics/capture';
import { ArrowUpRight, FileText, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/routing";
import { FormattedTextDisplay } from "@/components/FormattedTextDisplay";
import { useLocale, useTranslations } from "next-intl";
import { SpeakerContribution } from "@/lib/apiTypes";
import { PlayPauseButton } from "@/components/meetings/PlayPauseButton";
import { formatDate, formatTimestamp } from "@/lib/formatters/time";
import { PersonWithRelations } from "@/lib/db/people";
import { cn, filterActiveRoles, getPartyFromRoles } from "@/lib/utils";
import useSWR from "swr";
import { TopicIcon } from '@/components/TopicIcon';
import { ImageOrInitials } from '@/components/ImageOrInitials';
import { AgendaStateChip } from "@/components/subject/AgendaStateChip";
import { surfaceCardClass } from '@/components/ui/surface-card';
import { ContributionShareButton } from '@/components/sharing/ContributionShareButton';
import { getLocalizedName } from '@/lib/formatters/name';

interface UtteranceTimeRange {
    startTimestamp: number;
    endTimestamp: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.ok ? res.json() : null);

interface ContributionCardProps {
    contribution: SpeakerContribution & { id: string };
    subjectId: string;
    highlighted?: boolean;
    meeting: { id: string; cityId: string; released?: boolean };
    speaker: PersonWithRelations | null;
    /** Subject-lead head, for pages where the subject is the news (Person, Party). */
    contextHeader?: {
        meetingName: string;
        adminBodyName: string | null;
        meetingDate: Date;
        subjectName: string;
        topic: { name: string; colorHex: string; icon: string | null } | null;
        agendaItemIndex?: number | null;
        nonAgendaReason?: string | null;
        withdrawn?: boolean;
    };
    /** Render the in-page play button. Disable on pages without a VideoProvider (e.g. Person page). */
    showPlayButton?: boolean;
    /** Suppress navigation on the speaker name. */
    disableSpeakerNavigation?: boolean;
    /**
     * Show the speaker line. A person's own page turns this off — every card
     * repeating the page's own person was the old design's noise.
     */
    showSpeaker?: boolean;
    /** Tag this τοποθέτηση as the εισηγητής's (the subject page knows who introduced it). */
    isIntroducer?: boolean;
    /** Which page renders the card — the analytics discriminator. */
    sourcePage?: 'subject' | 'person' | 'party';
}

/**
 * One τοποθέτηση. One anatomy, two heads: on the subject page the speaker leads
 * (the subject is the page); with `contextHeader` the subject leads, carrying
 * its topic, agenda chip and date, and the party colour moves to the card's
 * left edge. The quote body and the ▶ timestamp chip never change between the
 * two — play and position-in-video are the same fact, so they share a control.
 */
export const ContributionCard = memo(function ContributionCard({
    contribution,
    subjectId,
    highlighted = false,
    meeting,
    speaker,
    contextHeader,
    showPlayButton = true,
    disableSpeakerNavigation = false,
    showSpeaker = true,
    isIntroducer = false,
    sourcePage = 'subject',
}: ContributionCardProps) {
    const t = useTranslations("Subject");
    const locale = useLocale();
    const sharing = useTranslations('sharing');
    const articleRef = useRef<HTMLElement>(null);
    useEffect(() => {
        if (highlighted) articleRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, [highlighted]);

    const { data: utteranceInfo } = useSWR<UtteranceTimeRange>(
        contribution.speakerId
            ? `/api/subject/${subjectId}/first-utterance/${contribution.speakerId}`
            : null,
        fetcher
    );

    const transcriptUrl = utteranceInfo
        ? `/${meeting.cityId}/${meeting.id}/transcript?t=${Math.floor(utteranceInfo.startTimestamp)}`
        : null;

    const party = speaker ? getPartyFromRoles(speaker.roles) : null;

    // Bar highlighting: the whole card lights this speaker's share of the
    // subject; the speaker's name narrows to everything they said all meeting.
    // Leaving the name falls back to the card's own highlight (we are still
    // inside the card), and both are no-ops on pages without a bar.
    const cardBarHover = useContributionBarHover(subjectId, contribution.speakerId ?? null);
    const speakerBarHover = useSpeakerBarHover(contribution.speakerId ?? null);
    const speakerNameHover = {
        onMouseEnter: speakerBarHover.onMouseEnter,
        onMouseLeave: cardBarHover.onMouseEnter,
        onFocus: speakerBarHover.onFocus,
        onBlur: cardBarHover.onFocus,
    };

    const captureCardAction = (action: string) =>
        captureEvent('subject_action', {
            action,
            surface: sourcePage,
            subject_id: subjectId,
            city_id: meeting.cityId,
            meeting_id: meeting.id,
        });

    // "Εντεταλμένος Νεολαίας · Αθήνα Τώρα": the speaker's city-level role, then their party.
    const cityRoleName = speaker
        ? filterActiveRoles(speaker.roles).find(r => r.cityId && !r.partyId && !r.administrativeBodyId)?.name ?? null
        : null;
    const speakerLine = [cityRoleName, party?.name].filter(Boolean).join(' · ');

    const chips = utteranceInfo ? (
        <span className="flex flex-wrap items-center gap-2 sm:gap-1.5">
            {/* The whole chip is the control — a pill you can only hit on its glyph is a
                fiddle. With a video it plays from here; without one it opens the
                transcript at the same second. */}
            {utteranceInfo && (showPlayButton ? (
                <PlayPauseButton
                    startTimestamp={utteranceInfo.startTimestamp}
                    endTimestamp={utteranceInfo.endTimestamp}
                    onPressPlay={() => captureCardAction('contribution_play')}
                    className="h-11 gap-2 rounded-full border-border bg-card px-3.5 text-[13px] font-semibold tabular-nums text-foreground shadow-none hover:!bg-muted hover:!text-foreground sm:h-7 sm:gap-1.5 sm:px-2.5 sm:text-[11px] [&_svg]:!size-3.5 sm:[&_svg]:!size-3"
                >
                    {formatTimestamp(utteranceInfo.startTimestamp)}
                </PlayPauseButton>
            ) : transcriptUrl && (
                <Link
                    href={transcriptUrl}
                    onClick={() => captureCardAction('contribution_transcript')}
                    className="inline-flex h-11 items-center rounded-full border border-border bg-card px-3.5 text-[13px] tabular-nums text-muted-foreground transition-colors hover:text-foreground hover:no-underline sm:h-7 sm:px-2.5 sm:text-[11px]"
                >
                    {formatTimestamp(utteranceInfo.startTimestamp)}
                </Link>
            ))}
            {/* Only beside a play control: without a video the timestamp pill IS
                the transcript link, and a second pill to the same URL said nothing. */}
            {showPlayButton && transcriptUrl && (
                <Link
                    href={transcriptUrl}
                    onClick={() => captureCardAction('contribution_transcript')}
                    title={t("transcript")}
                    aria-label={t("transcript")}
                    className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground sm:size-7"
                >
                    <FileText className="size-4 sm:size-3.5" aria-hidden />
                </Link>
            )}
        </span>
    ) : null;
    const shareButton = meeting.released !== false ? <ContributionShareButton
        cityId={meeting.cityId} meetingId={meeting.id} subjectId={subjectId} contributionId={contribution.id}
        text={contribution.text} speakerName={speaker ? getLocalizedName(speaker, locale) : contribution.speakerName ?? null}
        subjectName={contextHeader?.subjectName}
    /> : null;
    const speakerNameClass = cn("min-w-0 break-words font-semibold text-foreground", contextHeader ? "text-sm" : "text-base leading-6 sm:text-sm sm:leading-5");

    const speakerRow = showSpeaker && (
        <div className={cn("flex min-w-0 items-center gap-3", contextHeader && "mt-3 gap-2")}>
            {!contextHeader && (
                <span className="block h-10 w-10 shrink-0">
                    <ImageOrInitials
                        imageUrl={speaker?.image ?? null}
                        name={speaker?.name}
                        color={party?.colorHex}
                        width={40}
                        height={40}
                    />
                </span>
            )}
            {contextHeader && speaker && (
                <span className="block h-[26px] w-[26px] shrink-0">
                    <ImageOrInitials imageUrl={speaker.image} name={speaker.name} color={party?.colorHex} width={26} height={26} />
                </span>
            )}
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {speaker ? (
                    disableSpeakerNavigation ? (
                        <span className={speakerNameClass}>{speaker.name}</span>
                    ) : (
                        <Link
                            href={`/${meeting.cityId}/people/${speaker.id}`}
                            onClick={() => captureEvent('person_opened', { surface: 'contribution_speaker', city_id: meeting.cityId, person_id: speaker.id, page: sourcePage })}
                            className={cn(speakerNameClass, "hover:no-underline")}
                            {...speakerNameHover}
                        >
                            {speaker.name}
                        </Link>
                    )
                ) : contribution.speakerName ? (
                    <span className={speakerNameClass}>{contribution.speakerName}</span>
                ) : (
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {t("unknownSpeaker")}
                    </span>
                )}
                {isIntroducer && (
                    <span className="inline-flex h-[18px] shrink-0 items-center rounded bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                        {t("introducer")}
                    </span>
                )}
                {speakerLine && <span className="basis-full break-words text-xs leading-5 text-muted-foreground">{speakerLine}</span>}
            </span>
        </div>
    );

    const body = (
        // The measure comes from the column on context pages (the card fills it);
        // only the subject page's wide main column needs the card to cap itself.
        <div className={cn(
            'mt-3 min-w-0 break-words [&>.prose]:text-base [&>.prose]:leading-[1.65] [&>.prose]:text-foreground/90 sm:[&>.prose]:text-[14.5px]',
            '[&>.prose>:first-child]:mt-0 [&>.prose>:last-child]:mb-0 [&>.prose_a]:decoration-foreground/40 [&>.prose_a]:underline-offset-4 [&>.prose_a:hover]:decoration-foreground',
            !contextHeader && 'max-w-[66ch]',
        )}>
            <FormattedTextDisplay
                text={contribution.text}
                meetingId={meeting.id}
                cityId={meeting.cityId}
                linkColor="black"
                disableUtteranceExpansion={!!contextHeader}
            />
        </div>
    );

    if (!contextHeader) {
        // On phones the controls get their own row, leaving the name and text room to breathe.
        return (
            <article ref={articleRef} id={`contribution-${contribution.id}`} data-shared-contribution={highlighted || undefined}
                className={cn("scroll-mt-40 py-5", highlighted && "bg-[hsl(var(--orange)/0.05)] px-4")} {...cardBarHover}>
                <div className="min-w-0 flex-1">
                    {highlighted && <p className="mb-2 text-xs font-medium text-[hsl(var(--orange-deep))] dark:text-[hsl(var(--orange))]">{sharing('sharedContribution')}</p>}
                    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <div className="min-w-0">{speakerRow}</div>
                        {shareButton && <div className="col-start-2 row-start-1 sm:col-start-3">{shareButton}</div>}
                        {chips && <div className="col-span-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">{chips}</div>}
                    </header>
                    <div className={cn(showSpeaker && "sm:pl-[52px]")}>{body}</div>
                </div>
            </article>
        );
    }

    // Subject-lead: the subject heads the card; the party keeps the left edge.
    const subjectUrl = `/${meeting.cityId}/${meeting.id}/subjects/${subjectId}`;
    return (
        <article
            id={`contribution-${contribution.id}`}
            className={cn(surfaceCardClass, "scroll-mt-40 px-[18px] py-4 transition-shadow hover:shadow-md")}
            style={{ borderLeft: `3px solid ${party?.colorHex ?? 'hsl(var(--border))'}` }}
            {...cardBarHover}
        >
            <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-2">
                <TopicIcon color={contextHeader.topic?.colorHex} icon={contextHeader.topic?.icon} size="md" />
                <div className="min-w-0 flex-1">
                    {/* The title is the way into the subject — say so: a standing
                        arrow at its tail, and the site's orange on hover. */}
                    <Link
                        href={subjectUrl}
                        prefetch={false}
                        onClick={() => captureEvent('subject_opened', {
                            surface: 'contribution_card',
                            subject_id: subjectId,
                            city_id: meeting.cityId,
                            meeting_id: meeting.id,
                            page: sourcePage,
                        })}
                        className="group/subject block text-[15.5px] font-bold leading-tight text-foreground transition-colors hover:text-[hsl(var(--orange))] hover:no-underline"
                        style={{ textWrap: 'pretty' }}
                    >
                        {contextHeader.subjectName}
                        <ArrowUpRight className="mb-0.5 ml-1 inline h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover/subject:text-[hsl(var(--orange))]" aria-hidden />
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <AgendaStateChip
                            subject={{
                                withdrawn: contextHeader.withdrawn ?? false,
                                agendaItemIndex: contextHeader.agendaItemIndex ?? null,
                                nonAgendaReason: contextHeader.nonAgendaReason ?? null,
                            }}
                            t={t}
                        />
                        <span className="text-[11px] text-muted-foreground">
                            {contextHeader.adminBodyName ?? contextHeader.meetingName}
                            {' · '}
                            {formatDate(contextHeader.meetingDate)}
                        </span>
                    </div>
                </div>
                {shareButton}
                {chips && <div className="col-span-3">{chips}</div>}
            </header>
            {speakerRow}
            <div className="mt-1">{body}</div>
        </article>
    );
});

/**
 * The subject-led card's shape while it loads: topic dot, title and meta
 * lines, a speaker row, three lines of quote. Pages render a few of these
 * instead of a spinner, so the list doesn't jump when the real cards land.
 */
export function ContributionCardSkeleton() {
    return (
        <div className={cn(surfaceCardClass, 'border-l-[3px] px-[18px] py-4')}>
            <div className="flex items-start gap-2.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-2/5" />
                </div>
                <Skeleton className="h-7 w-20 shrink-0 rounded-full" />
            </div>
            <div className="mt-3.5 flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-3 w-44" />
            </div>
            <div className="mt-3 space-y-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/5" />
            </div>
        </div>
    );
}
