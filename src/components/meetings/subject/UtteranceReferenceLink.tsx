"use client";

import React, { useMemo, memo } from "react";
import { useCouncilMeetingData } from "@/components/meetings/CouncilMeetingDataContext";
import { useUtteranceExpansion } from "./UtteranceExpansionContext";
import { UtteranceMiniTranscript } from "./UtteranceMiniTranscript";
import { cn } from "@/lib/utils";
import { useUtteranceData } from "@/hooks/useUtteranceData";

interface UtteranceReferenceLinkProps {
  utteranceId: string;
  children: React.ReactNode;
  linkColor?: 'blue' | 'black';
}

const UtteranceReferenceLinkComponent = function UtteranceReferenceLink({
  utteranceId,
  children,
  linkColor = 'blue',
}: UtteranceReferenceLinkProps) {
  const { toggleExpansion, isExpanded: checkIsExpanded } = useUtteranceExpansion();
  const { meeting } = useCouncilMeetingData();
  const isExpanded = checkIsExpanded(utteranceId);

  // Look up utterance data
  const utteranceData = useUtteranceData(utteranceId);

  // Calculate context for mini transcript
  const contextData = useMemo(() => {
    if (!utteranceData) return null;

    const { segment, utteranceIndex } = utteranceData;

    // Extract context (5 before + current + 5 after)
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
  }, [utteranceData]);

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
