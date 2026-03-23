import { MinutesTranscriptEntry, MinutesSpeakerEntry } from './types';

/** Gaps shorter than this include the actual utterances for completeness. */
export const GAP_FILL_THRESHOLD_SECONDS = 15;

export interface TranscriptUtterance {
    text: string;
    startTimestamp: number;
    endTimestamp: number;
    speakerSegment: {
        speakerTag: {
            label: string | null;
            personId: string | null;
        };
    };
}

export interface SpeakerInfo {
    speakerName: string;
    party: string | null;
    isPartyHead: boolean;
    role: string | null;
}

export type SpeakerResolver = (personId: string | null, label: string | null) => SpeakerInfo;

/** Minimal info about utterances that exist in gap timeframes. */
export interface GapContentUtterance {
    startTimestamp: number;
    discussionSubjectId: string | null;
}

export interface TranscriptEntriesOptions {
    /** Utterances from the meeting that fall within gap timeframes (not part of the current subject). */
    gapContentUtterances?: GapContentUtterance[];
    /** Map of subject ID → subject name, for labeling gap markers. */
    subjectNames?: Map<string, string>;
}

export function buildTranscriptEntriesFromUtterances(
    utterances: TranscriptUtterance[],
    resolveSpeaker: SpeakerResolver,
    options?: TranscriptEntriesOptions,
): MinutesTranscriptEntry[] {
    if (utterances.length === 0) return [];

    const entries: MinutesTranscriptEntry[] = [];
    let currentPersonId: string | null | undefined = undefined;
    let currentLabel: string | null | undefined = undefined;
    let currentTexts: string[] = [];
    let currentTimestamp = 0;
    let lastEndTimestamp: number | null = null;

    function flushCurrentBlock() {
        if (currentTexts.length > 0 && currentPersonId !== undefined) {
            const info = resolveSpeaker(currentPersonId, currentLabel ?? null);
            const entry: MinutesSpeakerEntry = {
                type: 'speaker',
                speakerName: info.speakerName,
                party: info.party,
                isPartyHead: info.isPartyHead,
                role: info.role,
                text: currentTexts.join(' '),
                timestamp: currentTimestamp,
            };
            entries.push(entry);
        }
    }

    for (const u of utterances) {
        // Check for long gap before processing this utterance
        if (lastEndTimestamp !== null) {
            const gap = u.startTimestamp - lastEndTimestamp;
            if (gap >= GAP_FILL_THRESHOLD_SECONDS) {
                // Check if there's actual content in this gap (not just silence)
                const gapContent = options?.gapContentUtterances?.filter(
                    gc => gc.startTimestamp >= lastEndTimestamp! && gc.startTimestamp < u.startTimestamp
                );

                if (gapContent && gapContent.length > 0) {
                    // Real content gap — flush and insert marker
                    flushCurrentBlock();

                    // Resolve subjects discussed during the gap
                    const subjectIds = new Set(
                        gapContent.map(gc => gc.discussionSubjectId).filter((id): id is string => id !== null)
                    );
                    const subjects: { id: string; name: string }[] = [];
                    for (const id of subjectIds) {
                        const name = options?.subjectNames?.get(id);
                        if (name) subjects.push({ id, name });
                    }

                    entries.push({ type: 'gap', durationSeconds: gap, subjects });
                    // Reset speaker tracking — start fresh after gap
                    currentPersonId = undefined;
                    currentLabel = undefined;
                    currentTexts = [];
                } else if (!options?.gapContentUtterances) {
                    // No gap content info provided — fall back to always inserting markers
                    // (backwards compatibility for callers that don't provide gap info)
                    flushCurrentBlock();
                    entries.push({ type: 'gap', durationSeconds: gap, subjects: [] });
                    currentPersonId = undefined;
                    currentLabel = undefined;
                    currentTexts = [];
                }
                // else: silence (gap content info provided but no utterances in range) — skip marker
            }
        }

        const tag = u.speakerSegment.speakerTag;
        const isSameSpeaker =
            currentPersonId !== undefined &&
            tag.personId === currentPersonId &&
            (tag.personId !== null || tag.label === currentLabel);

        if (isSameSpeaker) {
            currentTexts.push(u.text);
        } else {
            flushCurrentBlock();
            currentPersonId = tag.personId;
            currentLabel = tag.label;
            currentTexts = [u.text];
            currentTimestamp = u.startTimestamp;
        }

        lastEndTimestamp = u.endTimestamp;
    }
    // Flush last block
    flushCurrentBlock();

    return entries;
}
