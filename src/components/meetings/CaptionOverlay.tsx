"use client";

import { useId, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useVideo } from './VideoProvider';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { useTranscriptOptions } from './options/OptionsContext';
import { useLiveTime } from './bar/useLiveTime';
import { resolveSpeakerDisplay } from '@/lib/utils/speakerDisplay';
import { excerptSourceIsVisible } from '@/lib/sharing/excerptSelector';
import { flattenUtterances, splitCaptionChunks, utteranceAt, type CaptionUtterance } from '@/lib/utils/captionTimeline';

/**
 * Captions and the speaker's name, over the expanded floating player — the
 * only place the video is large enough to carry them (the docked thumbnail is
 * 110×62px). Mirrors the dock's own now-playing convention: nothing shows
 * while paused, since a frozen frame has no "now" to caption.
 *
 * Both the name and the text come from the one utterance this picks for
 * `time` — never from a separately-computed band — so an interjection can
 * never pair its speaker's name with the turn it interrupted, or the reverse.
 */
export function CaptionOverlay() {
    const t = useTranslations('sharing');
    const { isPlaying, currentTimeRef } = useVideo();
    const { transcript, taskStatus, meeting, speakerTags, getSpeakerTag, getPerson } = useCouncilMeetingData();
    const { options } = useTranscriptOptions();
    const time = useLiveTime(currentTimeRef, isPlaying);
    const [showReviewNotice, setShowReviewNotice] = useState(false);
    const reviewNoticeId = useId();

    const utterances = useMemo<CaptionUtterance[]>(() => {
        const bySegment = transcript.map(segment => {
            const speakerTag = getSpeakerTag(segment.speakerTagId);
            const person = speakerTag?.personId ? getPerson(speakerTag.personId) : undefined;
            const { name, color } = resolveSpeakerDisplay(speakerTag, person, meeting.dateTime);
            return {
                // The transcript hides an utterance past the drift limit as
                // unreliable (see Utterance.tsx); the caption must hide it too.
                utterances: segment.utterances
                    .filter(utterance => excerptSourceIsVisible(utterance, options.maxUtteranceDrift))
                    .map(utterance => ({
                        id: utterance.id,
                        text: utterance.text,
                        startTimestamp: utterance.startTimestamp,
                        endTimestamp: utterance.endTimestamp,
                        speakerName: name,
                        speakerColor: color,
                    })),
            };
        });
        return flattenUtterances(bySegment);
    // The getters are identity-stable ref-backed reads, so they are not deps —
    // but speakerTags is: reassigning a tag mid-playback must recaption too
    // (see BarDataContext, which recolours the bar for the same reason).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transcript, meeting.dateTime, speakerTags, options.maxUtteranceDrift]);

    const utterance = isPlaying ? utteranceAt(utterances, time) : null;

    // A long utterance advances through its own chunks rather than freezing
    // on its first two lines for its whole duration. Another utterance that
    // starts inside this one's span takes the caption over while it plays
    // (see utteranceAt) — excluded here too, so this one's own chunks don't
    // advance past words that were never actually shown.
    const chunks = useMemo(() => {
        if (!utterance) return [];
        const gaps = utterances.filter(other =>
            other !== utterance && other.startTimestamp > utterance.startTimestamp && other.startTimestamp <= utterance.endTimestamp
        );
        return splitCaptionChunks(utterance, gaps);
    }, [utterance, utterances]);
    const chunk = utterance ? utteranceAt(chunks, time) ?? chunks[chunks.length - 1] ?? null : null;

    if (!utterance) return null;

    return (
        <div className="pointer-events-none absolute inset-0 z-[5] flex flex-col justify-end">
            {!taskStatus.humanReview && (
                <div className="pointer-events-auto absolute left-2 top-2 flex flex-col items-start gap-1">
                    {/* A button, not just a hover tooltip: a touch reader has no
                        hover, so the warning that captions may be AI-generated
                        and unreviewed (same concern as #348) needs a tap too. */}
                    <button
                        type="button"
                        onClick={() => setShowReviewNotice(shown => !shown)}
                        aria-expanded={showReviewNotice}
                        aria-controls={reviewNoticeId}
                        aria-label={t('unreviewedNotice')}
                        title={t('unreviewedNotice')}
                        className="flex size-5 items-center justify-center rounded-full bg-black/70"
                    >
                        <Info className="size-3 text-[hsl(var(--orange))]" aria-hidden />
                    </button>
                    {showReviewNotice && (
                        <p id={reviewNoticeId} className="max-w-[220px] rounded bg-black/85 px-2 py-1 text-[10px] leading-snug text-white">
                            {t('unreviewedNotice')}
                        </p>
                    )}
                </div>
            )}
            <div className="mx-auto mb-2 max-w-[92%] rounded bg-black/70 px-2 py-1 text-center">
                {utterance.speakerName && (
                    <div className="mb-0.5 flex items-center justify-center gap-1 text-[10px] font-bold text-white/90">
                        <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: utterance.speakerColor }}
                            aria-hidden
                        />
                        <span className="truncate">{utterance.speakerName}</span>
                    </div>
                )}
                {chunk && (
                    <p className="line-clamp-2 text-[11px] leading-snug text-white">{chunk.text}</p>
                )}
            </div>
        </div>
    );
}
