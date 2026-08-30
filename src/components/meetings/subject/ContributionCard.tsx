"use client";

import { memo } from "react";
import { FileText, Users } from "lucide-react";
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
import { getAgendaFullLabel } from '@/lib/utils/subjects';
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
                    className="h-7 gap-1.5 rounded-full border-border bg-card px-2.5 text-[11px] font-semibold tabular-nums text-foreground shadow-none hover:!bg-muted hover:!text-foreground [&_svg]:!h-3 [&_svg]:!w-3"
                >
                    {formatTimestamp(utteranceInfo.startTimestamp)}
                </PlayPauseButton>
            ) : transcriptUrl && (
                <Link
                    href={transcriptUrl}
                    className="inline-flex h-7 items-center rounded-full border border-border bg-card px-2.5 text-[11px] tabular-nums text-muted-foreground transition-colors hover:text-foreground hover:no-underline"
                >
                    {formatTimestamp(utteranceInfo.startTimestamp)}
                </Link>
            ))}
            {transcriptUrl && (
                <Link
                    href={transcriptUrl}
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
                            className="text-sm font-bold text-foreground hover:no-underline"
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
            <article className="flex gap-3.5 py-[18px]">
                <div className="min-w-0 flex-1">
                    {speakerRow}
                    <div className={cn(showSpeaker && "pl-[54px]")}>{body}</div>
                </div>
            </article>
        );
    }

    // Subject-lead: the subject heads the card; the party keeps the left edge.
    const agendaLabel = getAgendaFullLabel(t, {
        agendaItemIndex: contextHeader.agendaItemIndex ?? null,
        nonAgendaReason: contextHeader.nonAgendaReason ?? null,
    });
    const subjectUrl = `/${meeting.cityId}/${meeting.id}/subjects/${subjectId}`;
    return (
        <article
            className={cn(surfaceCardClass, "px-[18px] py-4 transition-shadow hover:shadow-md")}
            style={{ borderLeft: `3px solid ${party?.colorHex ?? 'hsl(var(--border))'}` }}
        >
            <div className="flex items-start gap-2.5">
                <TopicIcon color={contextHeader.topic?.colorHex} icon={contextHeader.topic?.icon} size="md" />
                <div className="min-w-0 flex-1">
                    <Link
                        href={subjectUrl}
                        className="block text-[15.5px] font-bold leading-tight text-foreground hover:no-underline"
                        style={{ textWrap: 'pretty' }}
                    >
                        {contextHeader.subjectName}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {agendaLabel !== null && (
                            <span className="inline-flex h-[18px] items-center rounded bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
                                {agendaLabel}
                            </span>
                        )}
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
