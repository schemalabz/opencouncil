"use client";
import React, { useMemo } from 'react';
import { useCouncilMeetingMeta } from "../CouncilMeetingDataContext";
import { useVideoActions } from "../VideoProvider";
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import { PersonBadge } from '@/components/persons/PersonBadge';
import { Bot } from "lucide-react";
import { formatTimestamp, getPartyFromRoles } from "@/lib/utils";
import { stripMarkdown } from '@/lib/formatters/markdown';
import { useTranslations } from 'next-intl';

const SHORT_UTTERANCE_MAX_CHARS = 160;
const SHORT_UTTERANCE_MAX_SENTENCES = 2;

interface SegmentContextProps {
    segment: TranscriptType[number];
}

interface Preview {
    text: string;
    isAI: boolean;
}

/**
 * Picks what to render below the speaker name in context mode.
 * Short speeches (≤ ~2 sentences) display verbatim — readers don't need a
 * summary for a one-liner. Longer speeches use the AI summary when available;
 * otherwise we clip the verbatim text to the short-speech budget and append
 * an ellipsis so the row visually signals it's a truncated excerpt rather
 * than a complete short utterance. The isAI flag drives a small icon so the
 * reader can tell at a glance which rows show synthetic vs verbatim text.
 */
function buildPreview(segment: TranscriptType[number]): Preview {
    const joined = segment.utterances.map(u => u.text).join(' ').trim();
    const sentenceCount = joined ? (joined.match(/[.!?]+(?:\s|$)/g)?.length ?? 1) : 0;
    const isShort = joined.length > 0
        && joined.length <= SHORT_UTTERANCE_MAX_CHARS
        && sentenceCount <= SHORT_UTTERANCE_MAX_SENTENCES;
    if (isShort) return { text: joined, isAI: false };

    const summaryText = segment.summary?.text;
    if (summaryText) return { text: stripMarkdown(summaryText).trim(), isAI: true };
    if (!joined) return { text: '', isAI: false };
    const clipped = joined.slice(0, SHORT_UTTERANCE_MAX_CHARS).trimEnd();
    return { text: `${clipped}…`, isAI: false };
}

/**
 * Compact one-line view used for every segment outside the active 3-item
 * focus window. Click the row to move the playhead there — playback advance
 * is what changes which segments are in focus.
 */
const SegmentContext = React.memo(({ segment }: SegmentContextProps) => {
    const { getPerson, getSpeakerTag } = useCouncilMeetingMeta();
    const { seekToWithoutScroll } = useVideoActions();
    const t = useTranslations('transcript.viewModes');

    const speakerTag = getSpeakerTag(segment.speakerTagId);
    const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
    const party = person ? getPartyFromRoles(person.roles) : null;
    const borderColor = party?.colorHex || '#D3D3D3';

    const preview = useMemo(() => buildPreview(segment), [segment]);

    const handleActivate = () => {
        // Move the playhead only — never force playback. The 4Hz poll in
        // Transcript picks up the new position and expands this row within
        // ~250ms. If the user was already playing they continue from here;
        // if paused, they stay paused. Expanding a row must not start audio.
        seekToWithoutScroll(segment.startTimestamp);
    };

    const speakerName = person?.name ?? speakerTag?.label ?? null;
    const timestamp = formatTimestamp(segment.startTimestamp);
    // The button's aria-label fully replaces its inner text for screen readers,
    // so the AI indicator has to live here too — the Bot SVG below is
    // decorative for AT.
    const baseLabel = speakerName
        ? t('seekHereDetailed', { speaker: speakerName, time: timestamp })
        : t('seekHere');
    const ariaLabel = preview.isAI ? `${baseLabel} · ${t('aiSummary')}` : baseLabel;

    return (
        <button
            type="button"
            onClick={handleActivate}
            aria-label={ariaLabel}
            className="my-1 w-full text-left rounded-r-md border-l-[3px] sm:border-l-4 bg-muted/20 hover:bg-muted/40 transition-colors px-2.5 sm:px-4 py-1.5 flex items-baseline gap-2 overflow-hidden"
            style={{ borderLeftColor: borderColor }}
        >
            <PersonBadge
                person={person}
                speakerTag={speakerTag}
                variant="inline"
                lastNameOnly
                className="shrink-0"
            />
            {preview.text && (
                <span className="text-xs sm:text-sm text-muted-foreground truncate flex-1 min-w-0 flex items-center gap-1">
                    {preview.isAI && (
                        <Bot
                            className="h-3 w-3 shrink-0 opacity-70"
                            aria-hidden="true"
                        />
                    )}
                    <span className="truncate">{preview.text}</span>
                </span>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                {timestamp}
            </span>
        </button>
    );
});
SegmentContext.displayName = 'SegmentContext';

export default SegmentContext;
