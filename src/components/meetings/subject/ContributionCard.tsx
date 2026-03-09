"use client";

import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Clock } from "lucide-react";
import { PersonBadge } from "@/components/persons/PersonBadge";
import { Link } from "@/i18n/routing";
import { FormattedTextDisplay } from "@/components/FormattedTextDisplay";
import { AIGeneratedBadge } from "@/components/AIGeneratedBadge";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { useTranslations } from "next-intl";
import { SpeakerContribution } from "@/lib/apiTypes";
import { PlayPauseButton } from "@/components/meetings/PlayPauseButton";
import { formatTimestamp } from "@/lib/formatters/time";
import { matchSpeakerNameToPerson } from "@/lib/utils/speakerMatch";
import useSWR from "swr";

interface UtteranceTimeRange {
    startTimestamp: number;
    endTimestamp: number;
}

const fetcher = (url: string) => fetch(url).then(res => res.ok ? res.json() : null);

interface ContributionCardProps {
    contribution: SpeakerContribution & { id: string };
    subjectId: string;
}

export const ContributionCard = memo(function ContributionCard({
    contribution,
    subjectId,
}: ContributionCardProps) {
    const { getPerson, meeting, people } = useCouncilMeetingData();
    const t = useTranslations("Subject");

    const speaker = useMemo(() => {
        // Direct lookup by ID
        if (contribution.speakerId) {
            return getPerson(contribution.speakerId) ?? null;
        }
        // Fallback: try to match speakerName against known people by shared
        // name tokens (handles role-prefixed names like "Αντιδήμαρχος Ευαγγελίδου")
        if (contribution.speakerName) {
            const matchedId = matchSpeakerNameToPerson(contribution.speakerName, people);
            if (matchedId) {
                return getPerson(matchedId) ?? null;
            }
        }
        return null;
    }, [contribution.speakerId, contribution.speakerName, getPerson, people]);

    // Use the resolved speaker's ID (from direct match or name fallback)
    const resolvedSpeakerId = speaker?.id ?? null;

    // Fetch the time range for this speaker's discussion of this subject
    // Uses the discussionSubjectId index for efficient lookup
    const { data: utteranceInfo } = useSWR<UtteranceTimeRange>(
        resolvedSpeakerId
            ? `/api/subject/${subjectId}/first-utterance/${resolvedSpeakerId}`
            : null,
        fetcher
    );

    // Build transcript URL using the utterance's start timestamp
    const transcriptUrl = utteranceInfo
        ? `/${meeting.cityId}/${meeting.id}/transcript?t=${Math.floor(utteranceInfo.startTimestamp)}`
        : null;

    return (
        <div className="p-4 space-y-4">
            {/* Header: Speaker Badge + Action Buttons */}
            <div className="flex flex-col md:flex-row md:items-center gap-4">
                {/* Speaker Badge */}
                {speaker ? (
                    <PersonBadge person={speaker} />
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
                            <PlayPauseButton
                                startTimestamp={utteranceInfo.startTimestamp}
                                endTimestamp={utteranceInfo.endTimestamp}
                            />
                            {transcriptUrl && (
                                <Button
                                    asChild
                                    variant="outline"
                                    size="sm"
                                    className="transition-colors hover:bg-primary hover:text-primary-foreground"
                                >
                                    <Link href={transcriptUrl}>
                                        <FileText className="h-4 w-4 mr-1.5" />
                                        {t("transcript")}
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
                />
            </div>

            {/* AI Generated Badge */}
            <div className="flex justify-end">
                <AIGeneratedBadge />
            </div>
        </div>
    );
});
