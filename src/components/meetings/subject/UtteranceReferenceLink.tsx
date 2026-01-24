"use client";

import React, { useMemo, memo } from "react";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { useUtteranceExpansion } from "./UtteranceExpansionContext";
import { UtteranceMiniTranscript } from "./UtteranceMiniTranscript";
import { cn } from "@/lib/utils";
import { Utterance } from "@prisma/client";

interface UtteranceReferenceLinkProps {
  utteranceId: string;
  children: React.ReactNode;
  linkColor?: 'blue' | 'black';
}

interface ContextData {
  utterances: Utterance[];
  targetIndex: number;
  hasMore: {
    before: boolean;
    after: boolean;
  };
  speakerSegment: {
    id: string;
    speakerTag: {
      id: string;
      label: string | null;
      personId: string | null;
    };
  };
}

const UtteranceReferenceLinkComponent = function UtteranceReferenceLink({
  utteranceId,
  children,
  linkColor = 'blue',
}: UtteranceReferenceLinkProps) {
  const { toggleExpansion, isExpanded: checkIsExpanded } = useUtteranceExpansion();
  const { transcript, meeting } = useCouncilMeetingData();
  const isExpanded = checkIsExpanded(utteranceId);

  // Calculate context utterances
  const contextData = useMemo((): ContextData | null => {
    // Find the speaker segment containing this utterance
    for (const segment of transcript) {
      const utteranceIndex = segment.utterances.findIndex(
        (u) => u.id === utteranceId
      );

      if (utteranceIndex !== -1) {
        // Found the utterance! Extract context (5 before + current + 5 after)
        const startIndex = Math.max(0, utteranceIndex - 5);
        const endIndex = Math.min(segment.utterances.length, utteranceIndex + 6);
        const contextUtterances = segment.utterances.slice(startIndex, endIndex);
        const targetIndex = utteranceIndex - startIndex; // Adjust for slice offset

        return {
          utterances: contextUtterances,
          targetIndex,
          hasMore: {
            before: startIndex > 0,
            after: endIndex < segment.utterances.length,
          },
          speakerSegment: {
            id: segment.id,
            speakerTag: segment.speakerTag,
          },
        };
      }
    }

    // Utterance not found in transcript
    return null;
  }, [transcript, utteranceId]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleExpansion(utteranceId);
  };

  // Link styling
  const linkClassName = linkColor === 'black'
    ? 'text-foreground underline decoration-dotted hover:opacity-80 cursor-pointer'
    : 'underline decoration-dotted hover:opacity-80 cursor-pointer';
  const linkStyle = linkColor === 'blue' ? { color: 'hsl(213 49% 73%)' } : undefined;

  // If utterance not found, render as plain text
  if (!contextData) {
    return <span className="text-muted-foreground">{children}</span>;
  }

  return (
    <span className="inline">
      <a
        onClick={handleClick}
        className={cn(
          linkClassName,
          isExpanded && "bg-accent rounded-sm px-1"
        )}
        style={linkStyle}
      >
        {children}
      </a>

      {isExpanded && (
        <div className="overflow-hidden">
          <UtteranceMiniTranscript
            utteranceId={utteranceId}
            contextUtterances={contextData.utterances}
            targetIndex={contextData.targetIndex}
            hasMore={contextData.hasMore}
            speakerSegment={contextData.speakerSegment}
            cityId={meeting.cityId}
          />
        </div>
      )}
    </span>
  );
};

// Only re-render if utteranceId or linkColor changes - ignore children prop changes
export const UtteranceReferenceLink = memo(
  UtteranceReferenceLinkComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.utteranceId === nextProps.utteranceId &&
      prevProps.linkColor === nextProps.linkColor
    );
  }
);
