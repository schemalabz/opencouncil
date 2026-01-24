"use client";

import React, { memo } from "react";
import { Utterance } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Clock, PlayCircle, PauseCircle, ArrowRight } from "lucide-react";
import { formatTimestamp } from "@/lib/formatters/time";
import { useVideo } from "@/components/meetings/VideoProvider";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { ImageOrInitials } from "@/components/ImageOrInitials";
import { cn, getPartyFromRoles } from "@/lib/utils";
import { useTranslations } from "next-intl";
import Link from "next/link";

// Separate component that uses useVideo - only this button re-renders on video updates
const PlayPauseButton = memo(function PlayPauseButton({
  startTimestamp,
  endTimestamp
}: {
  startTimestamp: number;
  endTimestamp: number;
}) {
  const { isPlaying, currentTime, seekToAndPlay, setIsPlaying } = useVideo();
  const t = useTranslations("transcript.miniTranscript");

  // Check if current time is within this utterance's range
  const isWithinRange = currentTime >= startTimestamp && currentTime <= endTimestamp;

  // Determine button state:
  // - Playing + within range = Pause
  // - Playing + outside range = Seek to
  // - Not playing = Play
  const isThisUtterancePlaying = isPlaying && isWithinRange;
  const shouldShowSeek = isPlaying && !isWithinRange;

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isThisUtterancePlaying) {
      setIsPlaying(false);
    } else {
      seekToAndPlay(startTimestamp);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handlePlayPause}
      className="h-8 px-3 text-xs font-medium"
    >
      {isThisUtterancePlaying ? (
        <>
          <PauseCircle className="w-4 h-4 mr-1.5" />
          {t("pause")}
        </>
      ) : shouldShowSeek ? (
        <>
          <PlayCircle className="w-4 h-4 mr-1.5" />
          {t("seekTo")}
        </>
      ) : (
        <>
          <PlayCircle className="w-4 h-4 mr-1.5" />
          {t("play")}
        </>
      )}
    </Button>
  );
});

interface UtteranceMiniTranscriptProps {
  utteranceId: string;
  contextUtterances: Utterance[];
  targetIndex: number; // Index of the highlighted utterance in contextUtterances
  hasMore: {
    before: boolean;
    after: boolean;
  };
  speakerSegment: {
    speakerTag: {
      id: string;
      label: string | null;
      personId: string | null;
    };
  };
  cityId?: string;
}

export const UtteranceMiniTranscript = memo(function UtteranceMiniTranscript({
  utteranceId,
  contextUtterances,
  targetIndex,
  hasMore,
  speakerSegment,
  cityId,
}: UtteranceMiniTranscriptProps) {
  const { getPerson } = useCouncilMeetingData();
  const t = useTranslations("transcript.miniTranscript");

  // The target utterance is the one we're highlighting
  const targetUtterance = contextUtterances[targetIndex];

  if (!targetUtterance) {
    return null;
  }

  // Get person info if available
  const person = speakerSegment.speakerTag.personId
    ? getPerson(speakerSegment.speakerTag.personId)
    : undefined;

  // Get party color
  const party = person ? getPartyFromRoles(person.roles) : null;
  const borderColor = party?.colorHex || '#D3D3D3';

  // Use the utterance API endpoint which handles navigation with proper timestamp
  const transcriptLink = `/api/utterance/${utteranceId}`;

  // Build the person link
  const personLink = person && cityId
    ? `/${cityId}/people/${person.id}`
    : null;

  return (
    <div
      className="my-2 rounded-md overflow-hidden bg-muted/20 border-l-4"
      style={{ borderLeftColor: borderColor }}
    >
      {/* Header: Avatar + Speaker + Timestamp + Buttons */}
      <div className="text-xs text-muted-foreground p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {/* Mini Avatar */}
          <div className="relative shrink-0">
            <div
              className="absolute inset-0 rounded-full opacity-20"
              style={{ backgroundColor: borderColor }}
            />
            <ImageOrInitials
              imageUrl={person?.image || null}
              name={person?.name || speakerSegment.speakerTag.label || "Unknown"}
              width={24}
              height={24}
              color={borderColor}
            />
          </div>

          {personLink ? (
            <Link
              href={personLink}
              className="font-medium text-foreground hover:underline truncate"
            >
              {person?.name || speakerSegment.speakerTag.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground truncate">
              {speakerSegment.speakerTag.label}
            </span>
          )}

          <span className="text-muted-foreground/50 shrink-0">•</span>
          <Clock className="w-3 h-3 shrink-0" />
          <span className="shrink-0">{formatTimestamp(targetUtterance.startTimestamp)}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 shrink-0">
          <PlayPauseButton
            startTimestamp={targetUtterance.startTimestamp}
            endTimestamp={targetUtterance.endTimestamp}
          />
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-8 px-3 text-xs font-medium"
          >
            <Link href={transcriptLink} onClick={(e) => e.stopPropagation()}>
              {t("transcript")}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Utterance Text - Single Line */}
      <div className="px-3 pb-3 max-h-[300px] overflow-y-auto overscroll-contain">
        <div className="text-sm leading-relaxed">
          {hasMore.before && (
            <span className="text-muted-foreground">... </span>
          )}
          {contextUtterances.map((utterance, index) => {
            const isTarget = index === targetIndex;
            return (
              <span
                key={utterance.id}
                className={cn(
                  isTarget && "font-semibold px-1 py-0.5 rounded"
                )}
                style={isTarget ? { backgroundColor: 'hsl(var(--gradient-orange) / 0.15)' } : undefined}
              >
                {utterance.text}{' '}
              </span>
            );
          })}
          {hasMore.after && (
            <span className="text-muted-foreground">...</span>
          )}
        </div>
      </div>
    </div>
  );
});
