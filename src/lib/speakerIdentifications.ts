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

const opinionOf = <T extends Pick<MethodIdentification, 'method'>>(identifications: T[], method: SpeakerIdentificationMethod): T | null =>
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
 * The sources an automatic pass records. A person one of them set stays open
 * to the next pass; anything else is a reviewer's. The one list both
 * isReviewerAssignment and the guarded write in applySpeakerHints read.
 */
export const AUTOMATIC_SOURCES = ['voiceprint', 'transcript', 'both'] as const satisfies readonly SpeakerAssignmentSource[];

const isAutomaticSource = (source: SpeakerAssignmentSource): boolean =>
    (AUTOMATIC_SOURCES as readonly SpeakerAssignmentSource[]).includes(source);

/**
 * The reviewer owns this tag's person, so an automatic pass must leave it alone.
 * A person with no recorded source counts as the reviewer's: nothing automatic
 * assigns a person without recording itself.
 */
export function isReviewerAssignment({ personId, personSetBy }: SpeakerAssignment): boolean {
    return personSetBy === null ? personId !== null : !isAutomaticSource(personSetBy);
}

/** A stored opinion may name a person or give a visitor's display label. */
type ShownIdentification = Omit<MethodIdentification, 'personId'> & {
    personId: string | null;
    name?: string | null;
    evidence?: string | null;
};

export type SpeakerSuggestion = ({ personId: string; name?: never } | { personId: null; name: string }) & {
    /** Which method suggests the identity; 'both' when the two agree. */
    source: 'voiceprint' | 'transcript' | 'both';
    /** The transcript line(s) the name rests on, when the transcript gave any. */
    evidence: string | null;
};

/** What the two methods add up to, for telling a reviewer at a glance. */
export type SpeakerIdentificationsStatus = 'agree' | 'disagree' | 'voiceprintOnly' | 'transcriptOnly';

/**
 * Whether the methods agree, differ, or only one has an opinion; null when
 * neither has one. Different people or a person and visitor label count as
 * 'disagree', even when the transcript would not act: the picker shows both.
 * The amber alert remains specific to two actionable roster-person opinions
 * (see speakerIdentificationsDisagree).
 */
export function speakerIdentificationsStatus(identifications: ShownIdentification[]): SpeakerIdentificationsStatus | null {
    const suggestions = listSpeakerSuggestions(identifications);
    if (suggestions.length > 1) return 'disagree';
    const source = suggestions[0]?.source;
    return source === 'both' ? 'agree' : source === 'voiceprint' ? 'voiceprintOnly' : source === 'transcript' ? 'transcriptOnly' : null;
}

/**
 * The people or visitor labels suggested for a speaker, for the reviewer's
 * picker: one entry when the methods agree or only one has an opinion, two when
 * they differ. Unlike reconcileSpeakerIdentifications, a name the transcript
 * would not act on is listed too — a reviewer can judge it, where an automatic
 * pass must not. This does not change the automatic person reconciliation policy.
 */
export function listSpeakerSuggestions(identifications: ShownIdentification[]): SpeakerSuggestion[] {
    const voiceprint = opinionOf(identifications, 'voiceprint');
    const transcript = opinionOf(identifications, 'transcript');
    if (voiceprint?.personId && transcript && voiceprint.personId === transcript.personId) {
        return [{ personId: voiceprint.personId, source: 'both', evidence: transcript.evidence ?? null }];
    }
    return [voiceprint, transcript].flatMap((opinion): SpeakerSuggestion[] => {
        if (!opinion) return [];
        const metadata = { source: opinion.method, evidence: opinion.evidence ?? null };
        if (opinion.personId !== null) return [{ personId: opinion.personId, ...metadata }];
        return opinion.name?.trim() ? [{ personId: null, name: opinion.name, ...metadata }] : [];
    });
}

/** An alternative to the displayed identity that no reviewer has decided on. */
export function hasPendingSpeakerSuggestion(
    identifications: ShownIdentification[],
    assignment: SpeakerAssignment & { label: string | null },
): boolean {
    if (isReviewerAssignment(assignment)) return false;
    return listSpeakerSuggestions(identifications).some(suggestion => suggestion.personId !== null
        ? suggestion.personId !== assignment.personId
        : assignment.personId !== null || suggestion.name !== assignment.label);
}
