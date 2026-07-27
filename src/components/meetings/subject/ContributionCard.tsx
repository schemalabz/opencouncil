"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Clock } from "lucide-react";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { Link } from "@/i18n/routing";
import { FormattedTextDisplay } from "@/components/FormattedTextDisplay";
import { AIGeneratedBadge } from "@/components/AIGeneratedBadge";
import { useTranslations } from "next-intl";
import { SpeakerContribution } from "@/lib/apiTypes";
import { PlayPauseButton } from "@/components/meetings/PlayPauseButton";
import { formatTimestamp, formatDate } from "@/lib/formatters/time";
import { PersonWithRelations } from "@/lib/db/people";
import { getPartyFromRoles } from "@/lib/utils";
import useSWR from "swr";
import { TopicIcon } from '@/components/TopicIcon';

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
    /** Optional admin-body + meeting + subject header shown above the card body (used on the Person page). */
    contextHeader?: {
        meetingName: string;
        adminBodyName: string | null;
        meetingDate: Date;
        subjectName: string;
        topic: { name: string; colorHex: string; icon: string | null } | null;
    };
    /** Render the in-page play button. Disable on pages without a VideoProvider (e.g. Person page). */
    showPlayButton?: boolean;
    /**
     * Suppress navigation on the speaker badge.
     */
    disableSpeakerNavigation?: boolean;
}

export const ContributionCard = memo(function ContributionCard({
    contribution,
    subjectId,
    meeting,
    speaker,
    contextHeader,
    showPlayButton = true,
    disableSpeakerNavigation = false,
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

    const subjectUrl = contextHeader
        ? `/${meeting.cityId}/${meeting.id}/subjects/${subjectId}`
        : null;

    // Party color for the colored left bar — matches the old Result/SpeakerSegment styling.
    // Only used when the card is rendered on a non-meeting page (i.e. contextHeader is set).
    const party = speaker ? getPartyFromRoles(speaker.roles) : null;
    const sideBarColor = party?.colorHex || '#D3D3D3';

    const headerLeft = contextHeader
        ? (contextHeader.adminBodyName
            ? `${contextHeader.adminBodyName} (${contextHeader.meetingName})`
            : contextHeader.meetingName)
        : null;
    const headerRight = contextHeader ? formatDate(contextHeader.meetingDate) : null;

    const body = (
        <div className={contextHeader ? "p-4 space-y-4 relative" : "p-4 space-y-4"}>
            {contextHeader && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-[3px] sm:w-1"
                    style={{
                        backgroundColor: sideBarColor,
                        borderTopLeftRadius: 'calc(0.5rem - 1.5px)',
                        borderBottomLeftRadius: 'calc(0.5rem - 1.5px)',
                    }}
                />
            )}
            <div className={contextHeader ? "pl-3 sm:pl-4 space-y-4" : "contents"}>
                {contextHeader && (
                    <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] sm:items-baseline gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            <span className="break-words">{headerLeft}</span>
                            <span className="sm:text-right">{headerRight}</span>
                        </div>
                        <Link
                            href={subjectUrl!}
                            className="inline-flex items-center gap-2 group"
                        >
                            <TopicIcon
                                color={contextHeader.topic?.colorHex}
                                icon={contextHeader.topic?.icon}
                                size="md"
                            />
                            <span className="text-lg sm:text-xl font-semibold leading-tight group-hover:underline">
                                {contextHeader.subjectName}
                            </span>
                        </Link>
                    </div>
                )}

                {/* Header: Speaker Badge + Action Buttons */}
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Speaker Badge */}
                    {speaker ? (
                        <PersonBadge person={speaker} disableNavigation={disableSpeakerNavigation} />
                    ) : contribution.speakerName ? (
                        <span className="text-sm font-medium">
                            {contribution.speakerName}
                        </span>
                    ) : (
                        <span className="text-sm text-muted-foreground italic">
                            {t("unknownSpeaker")}
                        </span>
                    )}

                    {/* Timestamp and Action Buttons - only show if we have utterance info */}
                    {utteranceInfo && (
                        <div className="flex items-center gap-2 md:ml-auto">
                            {/* Timestamp */}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                <span>{formatTimestamp(utteranceInfo.startTimestamp)}</span>
                            </div>
                            {/* Action Buttons */}
                            <div className="flex gap-2">
                                {showPlayButton && (
                                    <PlayPauseButton
                                        startTimestamp={utteranceInfo.startTimestamp}
                                        endTimestamp={utteranceInfo.endTimestamp}
                                    />
                                )}
                                {transcriptUrl && (
                                    <Button
                                        asChild
                                        variant="outline"
                                        size="sm"
                                        className="h-auto min-h-9 py-1.5 whitespace-normal text-left transition-colors hover:bg-primary hover:text-primary-foreground"
                                    >
                                        <Link href={transcriptUrl}>
                                            <FileText className="h-4 w-4 mr-1.5 shrink-0" />
                                            <span className="break-words">{t("transcript")}</span>
                                        </Link>
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Formatted Text with References */}
                <div className="text-sm text-muted-foreground text-justify">
                    <FormattedTextDisplay
                        text={contribution.text}
                        meetingId={meeting.id}
                        cityId={meeting.cityId}
                        linkColor="black"
                        disableUtteranceExpansion={!!contextHeader}
                    />
                </div>

                {/* AI Generated Badge */}
                <div className="flex justify-end">
                    <AIGeneratedBadge />
                </div>
            </div>
        </div>
    );

    if (!contextHeader) {
        return body;
    }

    // Same `Card` wrapping used by the old SpeakerSegment Result card —
    // subtle gradient border at rest, brand-colored animation on hover.
    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-0">
                {body}
            </CardContent>
        </Card>
    );
});
