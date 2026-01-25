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

/**
 * Builds smart display segments from multiple target utterances.
 * Merges overlapping contexts and adds gaps where needed.
 */
function buildSmartSegments(
  allUtterances: Utterance[],
  targetUtteranceIds: string[],
  contextSize: number = 2
): { segments: DisplaySegment[]; hasMore: { before: boolean; after: boolean } } {
  // Find indices of all target utterances
  const targetIndices = targetUtteranceIds
    .map(id => allUtterances.findIndex(u => u.id === id))
    .filter(index => index !== -1)
    .sort((a, b) => a - b);

  if (targetIndices.length === 0) {
    return { segments: [], hasMore: { before: false, after: false } };
  }

  // Build ranges: [start, end] for each target with context
  const ranges: Array<{ start: number; end: number; targetIndices: number[] }> = [];

  for (const targetIndex of targetIndices) {
    const start = Math.max(0, targetIndex - contextSize);
    const end = Math.min(allUtterances.length - 1, targetIndex + contextSize);

    // Try to merge with previous range if overlapping or adjacent
    const lastRange = ranges[ranges.length - 1];
    if (lastRange && start <= lastRange.end + 1) {
      // Merge: extend the end and add this target index
      lastRange.end = Math.max(lastRange.end, end);
      lastRange.targetIndices.push(targetIndex);
    } else {
      // New range
      ranges.push({ start, end, targetIndices: [targetIndex] });
    }
  }

  // Convert ranges to DisplaySegments
  const segments: DisplaySegment[] = ranges.map(range => {
    const utterances = allUtterances.slice(range.start, range.end + 1);
    // Convert absolute target indices to indices within this segment
    const targetIndices = new Set(
      range.targetIndices.map(absIndex => absIndex - range.start)
    );
    return { utterances, targetIndices };
  });

  const hasMore = {
    before: ranges[0].start > 0,
    after: ranges[ranges.length - 1].end < allUtterances.length - 1
  };

  return { segments, hasMore };
}

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

// Segment represents a continuous range of utterances to display
interface DisplaySegment {
  utterances: Utterance[];
  targetIndices: Set<number>; // Indices within this segment that should be highlighted
}

interface UtteranceMiniTranscriptProps {
  // Single-target mode (original)
  utteranceId?: string;
  contextUtterances?: Utterance[];
  targetIndex?: number; // Index of the highlighted utterance in contextUtterances
  hasMore?: {
    before: boolean;
    after: boolean;
  };

  // Multi-target mode (new)
  targetUtteranceIds?: string[]; // Multiple utterances to highlight
  allUtterances?: Utterance[]; // All utterances in the speaker segment

  // Common props
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
  // Single-target mode props
  utteranceId,
  contextUtterances,
  targetIndex,
  hasMore: hasMoreSingle,

  // Multi-target mode props
  targetUtteranceIds,
  allUtterances,

  // Common props
  speakerSegment,
  cityId,
}: UtteranceMiniTranscriptProps) {
  const { getPerson } = useCouncilMeetingData();
  const t = useTranslations("transcript.miniTranscript");

  // Determine mode and prepare data
  const isMultiMode = targetUtteranceIds && allUtterances;

  let segments: DisplaySegment[];
  let hasMore: { before: boolean; after: boolean };
  let firstTargetUtterance: Utterance | undefined;

  if (isMultiMode) {
    // Multi-target mode: build smart segments
    const result = buildSmartSegments(allUtterances, targetUtteranceIds, 2);
    segments = result.segments;
    hasMore = result.hasMore;

    // Find first target for header info
    firstTargetUtterance = allUtterances.find(u => targetUtteranceIds.includes(u.id));
  } else {
    // Single-target mode: use provided context
    if (!contextUtterances || targetIndex === undefined) {
      return null;
    }

    const targetUtterance = contextUtterances[targetIndex];
    if (!targetUtterance) {
      return null;
    }

    segments = [{
      utterances: contextUtterances,
      targetIndices: new Set([targetIndex])
    }];
    hasMore = hasMoreSingle || { before: false, after: false };
    firstTargetUtterance = targetUtterance;
  }

  if (!firstTargetUtterance) {
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
  const transcriptLink = isMultiMode
    ? `/api/utterance/${firstTargetUtterance.id}`
    : `/api/utterance/${utteranceId}`;

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
          <span className="shrink-0">{formatTimestamp(firstTargetUtterance.startTimestamp)}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 shrink-0">
          <PlayPauseButton
            startTimestamp={firstTargetUtterance.startTimestamp}
            endTimestamp={firstTargetUtterance.endTimestamp}
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

      {/* Utterance Text - Single or Multiple Segments */}
      <div className="px-3 pb-3 max-h-[300px] overflow-y-auto overscroll-contain">
        <div className="text-sm leading-relaxed">
          {hasMore.before && (
            <span className="text-muted-foreground">... </span>
          )}

          {segments.map((segment, segmentIndex) => (
            <React.Fragment key={segmentIndex}>
              {/* Show gap indicator between segments */}
              {segmentIndex > 0 && (
                <span className="text-muted-foreground"> ... </span>
              )}

              {/* Render utterances in this segment */}
              {segment.utterances.map((utterance, utteranceIndex) => {
                const isTarget = segment.targetIndices.has(utteranceIndex);
                return (
                  <span
                    key={utterance.id}
                    className={isTarget ? "px-1 py-0.5 rounded" : undefined}
                    style={isTarget ? { backgroundColor: 'hsl(var(--gradient-orange) / 0.15)' } : undefined}
                  >
                    {utterance.text}{' '}
                  </span>
                );
              })}
            </React.Fragment>
          ))}

          {hasMore.after && (
            <span className="text-muted-foreground"> ...</span>
          )}
        </div>
      </div>
    </div>
  );
});
