import type { SpeakerAssignmentSource, SpeakerIdentificationMethod } from '@prisma/client';

/**
 * Speaker identifications: what each method says about who a diarization
 * speaker is.
 *
 * - The voiceprint identification comes from the transcribe task, which matches
 *   the voice against stored voiceprints.
 * - The transcript identification comes from the fixTranscript task, which reads
 *   who is speaking from the text alone (the chair giving the floor by name,
 *   roll calls, self-introductions). It never sees the voiceprint matches.
 *
 * Each method decides for itself, on the task server, whether it would act on
 * its opinion (`actionable`). This module decides what the opinions add up to
 * by comparing identities only: it thresholds no score. It is pure, so the task
 * handler and the reviewer's editor apply exactly the same rules.
 */

/** One method's opinion on a speaker, as the rules need it. */
export type MethodIdentification = {
    method: SpeakerIdentificationMethod;
    personId: string;
    /** The method would act on this opinion by itself. False marks a suggestion for a reviewer. */
    actionable: boolean;
};

export type SpeakerAssignment = {
    personId: string | null;
    personSetBy: SpeakerAssignmentSource | null;
};

const opinionOf = <T extends MethodIdentification>(identifications: T[], method: SpeakerIdentificationMethod): T | null =>
    identifications.find(identification => identification.method === method) ?? null;

/** The person a method names, when the method would act on the name by itself. */
const actionablePersonId = (identification: MethodIdentification | null): string | null =>
    identification?.actionable ? identification.personId : null;

/**
 * Who the speaker is, going by the identifications alone.
 *
 * - Both methods name the same person: that person. Agreement corroborates the
 *   voiceprint, even when the transcript would not act on the name alone.
 * - Both would act, on different people: nobody. One of them is wrong, and no
 *   name is better than a wrong one; the editor alerts the reviewer, who
 *   decides (see speakerIdentificationsDisagree).
 * - Only the voiceprint would act: the voiceprint's person. A name the
 *   transcript would not act on does not unseat a match.
 * - Only the transcript would act: the transcript's person.
 * - Otherwise nobody.
 */
export function reconcileSpeakerIdentifications(identifications: MethodIdentification[]): SpeakerAssignment {
    if (speakerIdentificationsDisagree(identifications)) {
        return { personId: null, personSetBy: null };
    }
    const voiceprintPersonId = actionablePersonId(opinionOf(identifications, 'voiceprint'));
    const transcript = opinionOf(identifications, 'transcript');
    if (voiceprintPersonId) {
        return { personId: voiceprintPersonId, personSetBy: transcript?.personId === voiceprintPersonId ? 'both' : 'voiceprint' };
    }
    const transcriptPersonId = actionablePersonId(transcript);
    return transcriptPersonId ? { personId: transcriptPersonId, personSetBy: 'transcript' } : { personId: null, personSetBy: null };
}

/** Both methods would act, and they name different people. */
export function speakerIdentificationsDisagree(identifications: MethodIdentification[]): boolean {
    const voiceprintPersonId = actionablePersonId(opinionOf(identifications, 'voiceprint'));
    const transcriptPersonId = actionablePersonId(opinionOf(identifications, 'transcript'));
    return Boolean(voiceprintPersonId && transcriptPersonId && voiceprintPersonId !== transcriptPersonId);
}

/**
 * The reviewer owns this tag's person, so an automatic pass must leave it alone.
 * A person with no recorded source counts as the reviewer's: nothing automatic
 * assigns a person without recording itself.
 */
export function isReviewerAssignment({ personId, personSetBy }: SpeakerAssignment): boolean {
    return personSetBy === 'user' || (personSetBy === null && personId !== null);
}

/** What a reviewer is shown about one opinion, beyond who it names. */
type ShownIdentification = MethodIdentification & { evidence?: string | null };

export type SpeakerSuggestion = {
    personId: string;
    /** Which method suggests the person; 'both' when the two agree. */
    source: 'voiceprint' | 'transcript' | 'both';
    /** The transcript line(s) the name rests on, when the transcript gave any. */
    evidence: string | null;
};

/** What the two methods add up to, for telling a reviewer at a glance. */
export type SpeakerIdentificationsStatus = 'agree' | 'disagree' | 'voiceprintOnly' | 'transcriptOnly';

/**
 * Whether the methods agree, differ, or only one has an opinion; null when
 * neither has one. Any two different people count as 'disagree' here, even
 * when the transcript would not act on its name: the picker shows both. Only a
 * disagreement both would act on raises the alert (see
 * speakerIdentificationsDisagree).
 */
export function speakerIdentificationsStatus(identifications: MethodIdentification[]): SpeakerIdentificationsStatus | null {
    const voiceprint = opinionOf(identifications, 'voiceprint');
    const transcript = opinionOf(identifications, 'transcript');
    if (voiceprint && transcript) return voiceprint.personId === transcript.personId ? 'agree' : 'disagree';
    if (voiceprint) return 'voiceprintOnly';
    return transcript ? 'transcriptOnly' : null;
}

/**
 * The people the identifications suggest for a speaker, for the reviewer's
 * picker: one entry when the methods agree or only one has an opinion, two when
 * they differ. Unlike reconcileSpeakerIdentifications, a name the transcript
 * would not act on is listed too — a reviewer can judge it, where an automatic
 * pass must not.
 */
export function listSpeakerSuggestions(identifications: ShownIdentification[]): SpeakerSuggestion[] {
    const voiceprint = opinionOf(identifications, 'voiceprint');
    const transcript = opinionOf(identifications, 'transcript');
    if (voiceprint && transcript && voiceprint.personId === transcript.personId) {
        return [{ personId: voiceprint.personId, source: 'both', evidence: transcript.evidence ?? null }];
    }
    return [
        ...(voiceprint ? [{ personId: voiceprint.personId, source: 'voiceprint' as const, evidence: null }] : []),
        ...(transcript ? [{ personId: transcript.personId, source: 'transcript' as const, evidence: transcript.evidence ?? null }] : []),
    ];
}
