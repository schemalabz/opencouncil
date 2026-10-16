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
 * - The minutes identification comes from the fixFromMinutes task, which reads
 *   the speaker labels of the municipality's own minutes, aligned with the
 *   transcript (#876).
 *
 * Each method decides for itself, on the task server, whether it would act on
 * its opinion (`actionable`). This module decides what the opinions add up to
 * by comparing identities only: it thresholds no score, and it ranks no method
 * above another. It is pure, so the task handler and the reviewer's editor
 * apply exactly the same rules.
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

/** The methods, in the order the picker lists them. */
export const SPEAKER_IDENTIFICATION_METHODS = ['voiceprint', 'transcript', 'minutes'] as const satisfies readonly SpeakerIdentificationMethod[];

const opinionOf = <T extends MethodIdentification>(identifications: T[], method: SpeakerIdentificationMethod): T | null =>
    identifications.find(identification => identification.method === method) ?? null;

/** The opinions a method would act on by itself, one per method, in method order. */
const actionableOpinions = (identifications: MethodIdentification[]): MethodIdentification[] =>
    SPEAKER_IDENTIFICATION_METHODS
        .map(method => opinionOf(identifications, method))
        .filter((identification): identification is MethodIdentification => identification?.actionable === true);

/**
 * The person that the actionable opinions settle on, or null.
 *
 * - One person named by every actionable opinion: that person.
 * - A person named by more actionable opinions than any other (two of three):
 *   that person. One method is wrong, and two agree.
 * - A tie between different people (one against one, or three different):
 *   nobody. No name is better than a wrong one; the editor alerts the reviewer,
 *   who decides (see speakerIdentificationsDisagree).
 */
function settledPersonId(actionable: MethodIdentification[]): string | null {
    if (actionable.length === 0) return null;
    const votes = new Map<string, number>();
    for (const { personId } of actionable) votes.set(personId, (votes.get(personId) ?? 0) + 1);
    const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
    const [leader, runnerUp] = ranked;
    return runnerUp && runnerUp[1] === leader[1] ? null : leader[0];
}

/**
 * Who the speaker is, going by the identifications alone.
 *
 * The person the actionable opinions settle on (see settledPersonId) is
 * assigned. `personSetBy` names the one method behind the name, or `both` when
 * two or more methods name the person: agreement corroborates a method, even
 * from an opinion that would not act alone. Otherwise nobody.
 */
export function reconcileSpeakerIdentifications(identifications: MethodIdentification[]): SpeakerAssignment {
    const personId = settledPersonId(actionableOpinions(identifications));
    if (personId === null) {
        return { personId: null, personSetBy: null };
    }
    const agreeing = identifications.filter(identification => identification.personId === personId);
    return { personId, personSetBy: agreeing.length > 1 ? 'both' : agreeing[0].method };
}

/** Two or more methods would act, and no person has more of their votes than another. */
export function speakerIdentificationsDisagree(identifications: MethodIdentification[]): boolean {
    const actionable = actionableOpinions(identifications);
    return actionable.length > 1 && settledPersonId(actionable) === null;
}

/**
 * The sources an automatic pass records. A person one of them set stays open
 * to the next pass; anything else is a reviewer's. The one list both
 * isReviewerAssignment and the guarded write in applySpeakerHints read.
 */
export const AUTOMATIC_SOURCES = ['voiceprint', 'transcript', 'minutes', 'both'] as const satisfies readonly SpeakerAssignmentSource[];

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

/** What a reviewer is shown about one opinion, beyond who it names. */
type ShownIdentification = MethodIdentification & { evidence?: string | null };

export type SpeakerSuggestionSource = SpeakerIdentificationMethod | 'both';

export type SpeakerSuggestion = {
    personId: string;
    /** Which method suggests the person; 'both' when two or more agree. */
    source: SpeakerSuggestionSource;
    /** The line(s) the name rests on, when a method gave any. */
    evidence: string | null;
};

/** What the methods add up to, for telling a reviewer at a glance. */
export type SpeakerIdentificationsStatus = 'agree' | 'disagree' | 'voiceprintOnly' | 'transcriptOnly' | 'minutesOnly';

/**
 * Whether the methods agree, differ, or only one has an opinion; null when
 * none has one. Any two different people count as 'disagree' here, even when
 * a method would not act on its name: the picker shows every name. Only a
 * disagreement the methods would act on raises the alert (see
 * speakerIdentificationsDisagree).
 */
export function speakerIdentificationsStatus(identifications: MethodIdentification[]): SpeakerIdentificationsStatus | null {
    const opinions = SPEAKER_IDENTIFICATION_METHODS
        .map(method => opinionOf(identifications, method))
        .filter((identification): identification is MethodIdentification => identification !== null);
    if (opinions.length === 0) return null;
    if (opinions.length === 1) return `${opinions[0].method}Only`;
    return new Set(opinions.map(opinion => opinion.personId)).size === 1 ? 'agree' : 'disagree';
}

/**
 * The people the identifications suggest for a speaker, for the reviewer's
 * picker: one entry per person, in method order. A person two or more methods
 * name is listed once, as 'both', with the first evidence any of them gave.
 * Unlike reconcileSpeakerIdentifications, a name a method would not act on is
 * listed too: a reviewer can judge it, where an automatic pass must not.
 */
export function listSpeakerSuggestions(identifications: ShownIdentification[]): SpeakerSuggestion[] {
    const suggestions: SpeakerSuggestion[] = [];
    for (const method of SPEAKER_IDENTIFICATION_METHODS) {
        const opinion = opinionOf(identifications, method);
        if (!opinion) continue;
        const existing = suggestions.find(suggestion => suggestion.personId === opinion.personId);
        if (existing) {
            existing.source = 'both';
            existing.evidence ??= opinion.evidence ?? null;
        } else {
            suggestions.push({ personId: opinion.personId, source: method, evidence: opinion.evidence ?? null });
        }
    }
    return suggestions;
}
