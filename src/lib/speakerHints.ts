import type { SpeakerAssignmentSource } from '@prisma/client';

/**
 * Speaker hints: two independent opinions on who a diarization speaker is.
 *
 * - The voiceprint hint comes from the transcribe task, which matches the voice
 *   against stored voiceprints.
 * - The transcript hint comes from the fixTranscript task, which reads who is
 *   speaking from the text alone (the chair giving the floor by name, roll
 *   calls, self-introductions). It never sees the voiceprint matches.
 *
 * This module decides what the two add up to. It is pure, so the task handler
 * and the reviewer's editor apply exactly the same rules.
 */

/**
 * The least confidence at which a transcript hint acts on its own. Across 49
 * reviewed meetings, 1% of the speaking time named at this bar was wrong, and
 * the bar below it (70) let in half again as many wrong names.
 */
export const TRANSCRIPT_HINT_MIN_CONFIDENCE = 80;

export type SpeakerHints = {
    voiceprintPersonId: string | null;
    transcriptPersonId: string | null;
    transcriptConfidence: number | null;
};

export type SpeakerAssignment = {
    personId: string | null;
    personSetBy: SpeakerAssignmentSource | null;
};

/** The transcript's person, when the hint is confident enough to act on alone. */
function confidentTranscriptPersonId({ transcriptPersonId, transcriptConfidence }: SpeakerHints): string | null {
    return transcriptPersonId && (transcriptConfidence ?? 0) >= TRANSCRIPT_HINT_MIN_CONFIDENCE ? transcriptPersonId : null;
}

/**
 * Who the speaker is, going by the hints alone.
 *
 * - Both methods name the same person: that person. Agreement corroborates the
 *   voiceprint whatever the transcript's confidence.
 * - The two confidently disagree: nobody. One of them is wrong, and no name is
 *   better than a wrong one; the editor alerts the reviewer, who decides (see
 *   speakerHintsDisagree).
 * - Only the voiceprint names someone, or the transcript differs without being
 *   confident: the voiceprint's person. An unsure guess does not unseat a match.
 * - Only the transcript names someone: that person, if the hint is confident.
 * - Otherwise nobody.
 */
export function reconcileSpeakerHints(hints: SpeakerHints): SpeakerAssignment {
    const { voiceprintPersonId, transcriptPersonId } = hints;
    if (speakerHintsDisagree(hints)) {
        return { personId: null, personSetBy: null };
    }
    if (voiceprintPersonId) {
        return { personId: voiceprintPersonId, personSetBy: voiceprintPersonId === transcriptPersonId ? 'both' : 'voiceprint' };
    }
    const confident = confidentTranscriptPersonId(hints);
    return confident ? { personId: confident, personSetBy: 'transcript' } : { personId: null, personSetBy: null };
}

/** The two methods name different people, and the transcript is confident about it. */
export function speakerHintsDisagree(hints: SpeakerHints): boolean {
    const confident = confidentTranscriptPersonId(hints);
    return Boolean(hints.voiceprintPersonId && confident && confident !== hints.voiceprintPersonId);
}

/**
 * The reviewer owns this tag's person, so an automatic pass must leave it alone.
 * A person with no recorded source counts as the reviewer's: nothing automatic
 * assigns a person without recording itself.
 */
export function isReviewerAssignment({ personId, personSetBy }: SpeakerAssignment): boolean {
    return personSetBy === 'user' || (personSetBy === null && personId !== null);
}

export type SpeakerSuggestion = {
    personId: string;
    /** Which method suggests the person; 'both' when the two agree. */
    source: 'voiceprint' | 'transcript' | 'both';
};

/** What the two methods add up to, for telling a reviewer at a glance. */
export type SpeakerHintsStatus = 'agree' | 'disagree' | 'voiceprintOnly' | 'transcriptOnly';

/**
 * Whether the methods agree, differ, or only one has an opinion; null when
 * neither has one. Any two
 * different people count as 'disagree' here, however unsure the transcript is:
 * the picker shows both. Only a confident disagreement raises the alert (see
 * speakerHintsDisagree).
 */
export function speakerHintsStatus({ voiceprintPersonId, transcriptPersonId }: SpeakerHints): SpeakerHintsStatus | null {
    if (voiceprintPersonId && transcriptPersonId) return voiceprintPersonId === transcriptPersonId ? 'agree' : 'disagree';
    if (voiceprintPersonId) return 'voiceprintOnly';
    return transcriptPersonId ? 'transcriptOnly' : null;
}

/**
 * The people the hints suggest for a speaker, for the reviewer's picker: one
 * entry when the methods agree or only one has an opinion, two when they differ.
 * Unlike reconcileSpeakerHints, an unsure transcript hint is listed too — a
 * reviewer can judge it, where an automatic pass must not.
 */
export function listSpeakerSuggestions({ voiceprintPersonId, transcriptPersonId }: SpeakerHints): SpeakerSuggestion[] {
    if (voiceprintPersonId && voiceprintPersonId === transcriptPersonId) {
        return [{ personId: voiceprintPersonId, source: 'both' }];
    }
    return [
        ...(voiceprintPersonId ? [{ personId: voiceprintPersonId, source: 'voiceprint' as const }] : []),
        ...(transcriptPersonId ? [{ personId: transcriptPersonId, source: 'transcript' as const }] : []),
    ];
}
