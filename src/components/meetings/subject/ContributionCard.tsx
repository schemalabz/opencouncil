"use client";

import { memo } from "react";
import { useContributionBarHover, useSpeakerBarHover } from '@/components/meetings/bar/BarHighlightContext';
import { captureEvent } from '@/lib/analytics/capture';
import { ArrowUpRight, FileText, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/routing";
import { FormattedTextDisplay } from "@/components/FormattedTextDisplay";
import { useTranslations } from "next-intl";
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

interface UtteranceTimeRange {
    startTimestamp: number;
    endTimestamp: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.ok ? res.json() : null);

interface ContributionCardProps {
    contribution: SpeakerContribution & { id: string };
    subjectId: string;
    meeting: { id: string; cityId: string };
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

    const chips = (
        <span className="flex shrink-0 items-center gap-1.5">
            {/* The whole chip is the control — a pill you can only hit on its glyph is a
                fiddle. With a video it plays from here; without one it opens the
                transcript at the same second. */}
            {utteranceInfo && (showPlayButton ? (
                <PlayPauseButton
                    startTimestamp={utteranceInfo.startTimestamp}
                    endTimestamp={utteranceInfo.endTimestamp}
                    onPressPlay={() => captureCardAction('contribution_play')}
                    className="h-7 gap-1.5 rounded-full border-border bg-card px-2.5 text-[11px] font-semibold tabular-nums text-foreground shadow-none hover:!bg-muted hover:!text-foreground [&_svg]:!h-3 [&_svg]:!w-3"
                >
                    {formatTimestamp(utteranceInfo.startTimestamp)}
                </PlayPauseButton>
            ) : transcriptUrl && (
                <Link
                    href={transcriptUrl}
                    onClick={() => captureCardAction('contribution_transcript')}
                    className="inline-flex h-7 items-center rounded-full border border-border bg-card px-2.5 text-[11px] tabular-nums text-muted-foreground transition-colors hover:text-foreground hover:no-underline"
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
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                >
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                </Link>
            )}
        </span>
    );

    const speakerRow = showSpeaker && (
        <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", contextHeader && "mt-3")}>
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
                        <span className="text-sm font-bold">{speaker.name}</span>
                    ) : (
                        <Link
                            href={`/${meeting.cityId}/people/${speaker.id}`}
                            onClick={() => captureEvent('person_opened', { surface: 'contribution_speaker', city_id: meeting.cityId, person_id: speaker.id, page: sourcePage })}
                            className="text-sm font-bold text-foreground hover:no-underline"
                            {...speakerNameHover}
                        >
                            {speaker.name}
                        </Link>
                    )
                ) : contribution.speakerName ? (
                    <span className="text-sm font-medium">{contribution.speakerName}</span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm italic text-muted-foreground">
                        <Users className="h-3.5 w-3.5" aria-hidden />
                        {t("unknownSpeaker")}
                    </span>
                )}
                {isIntroducer && (
                    <span className="inline-flex h-[18px] shrink-0 items-center rounded bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                        {t("introducer")}
                    </span>
                )}
                {speakerLine && <span className="text-[11.5px] text-muted-foreground">{speakerLine}</span>}
            </span>
            {!contextHeader && chips}
        </div>
    );

    const body = (
        // The measure comes from the column on context pages (the card fills it);
        // only the subject page's wide main column needs the card to cap itself.
        <div className={cn('mt-2 text-[14.5px] leading-[1.62] text-foreground/85', !contextHeader && 'max-w-[66ch]')}>
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
        // Plain: the speaker leads. The avatar spans the head; the quote hangs under it.
        return (
            <article className="flex gap-3.5 py-[18px]" {...cardBarHover}>
                <div className="min-w-0 flex-1">
                    {speakerRow}
                    <div className={cn(showSpeaker && "pl-[54px]")}>{body}</div>
                </div>
            </article>
        );
    }

    // Subject-lead: the subject heads the card; the party keeps the left edge.
    const subjectUrl = `/${meeting.cityId}/${meeting.id}/subjects/${subjectId}`;
    return (
        <article
            className={cn(surfaceCardClass, "px-[18px] py-4 transition-shadow hover:shadow-md")}
            style={{ borderLeft: `3px solid ${party?.colorHex ?? 'hsl(var(--border))'}` }}
            {...cardBarHover}
        >
            <div className="flex items-start gap-2.5">
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
                {chips}
            </div>
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
