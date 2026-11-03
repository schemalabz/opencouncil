/**
 * Applies the transcript speaker hints a fixTranscript result carries.
 *
 * NOT in a "use server" file: this writes speaker assignments, and must not be
 * callable as a Server Action. It runs on the task-server callback only.
 */
import "server-only";
import { Prisma, type Realm, type SpeakerAssignmentSource } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { SpeakerHint, UnlistedSpeakerHint } from '@/lib/apiTypes';
import { AUTOMATIC_SOURCES, isReviewerAssignment, reconcileSpeakerIdentifications, MethodIdentification } from '@/lib/speakerIdentifications';
import { buildUnknownSpeakerLabel, isUnknownSpeakerLabel, lastUnknownSpeakerIndex } from '@/lib/utils/unknownSpeakerLabel';

/**
 * The tags isReviewerAssignment leaves open, as a query, built from the same
 * AUTOMATIC_SOURCES. It guards the write itself, so a reviewer who takes a tag
 * while the hints are being applied still wins. Spelled positively: in SQL, NOT
 * over a nullable column drops the NULL rows, which are exactly the untouched
 * tags.
 */
export const automaticAssignmentWhere = {
    OR: [
        { personSetBy: { in: [...AUTOMATIC_SOURCES] } },
        { personSetBy: null, personId: null },
    ],
} satisfies Prisma.SpeakerTagWhereInput;

/** The label the transcribe import gives a voiceprint-matched speaker. */
const RAW_SPEAKER_LABEL = /^SPEAKER_\d+$/;

/** The label the editor gives a segment a reviewer adds or splits off. */
const NEW_SEGMENT_LABEL = /^New /;

/**
 * A label that names nobody: the import's, the editor's, or an unknown speaker
 * in the language of any realm. An automatic pass may replace it with a name;
 * any other label is a reviewer's words, or a name an earlier run wrote.
 */
export function isPlaceholderLabel(label: string | null | undefined): boolean {
    return !label || RAW_SPEAKER_LABEL.test(label) || NEW_SEGMENT_LABEL.test(label) || isUnknownSpeakerLabel(label);
}

/** Hands out "unknown speaker N" labels that continue the meeting's numbering, in the language of the city's realm. */
function unknownSpeakerLabels(existingLabels: (string | null)[], realm: Realm) {
    let last = lastUnknownSpeakerIndex(existingLabels);
    return { next: () => buildUnknownSpeakerLabel(++last, realm) };
}

const identifiedTagSelect = {
    id: true,
    label: true,
    personId: true,
    personSetBy: true,
    identifications: {
        select: { method: true, personId: true, name: true, actionable: true, evidenceKind: true, confidence: true, evidence: true },
    },
} satisfies Prisma.SpeakerTagSelect;

type IdentifiedTag = Prisma.SpeakerTagGetPayload<{ select: typeof identifiedTagSelect }>;

/** What a hint stores as the tag's transcript identification. */
function transcriptIdentification(hint: SpeakerHint | UnlistedSpeakerHint) {
    return {
        personId: 'personId' in hint ? hint.personId : null,
        name: 'name' in hint ? hint.name : null,
        // Only an explicit yes: a hint that does not say is one nobody acts on.
        actionable: hint.actionable === true,
        evidenceKind: hint.evidenceKind ?? null,
        confidence: hint.confidence,
        evidence: hint.evidence,
    };
}

type TagAssignment = { personId: string | null; personSetBy: SpeakerAssignmentSource | null; label: string | null };

/**
 * What the tag should show once the hints are applied: the person the methods
 * add up to, or, for a speaker who is not on the roster, the label the
 * transcript gives them.
 *
 * - An actionable unlisted label replaces a placeholder label, or the label an
 *   earlier run wrote. A label a reviewer typed never reaches here (see
 *   isReviewerAssignment), and a tag that keeps a person keeps its label: a
 *   voiceprint match stands.
 * - A label an earlier run wrote, with no actionable label in this run, goes
 *   back to an unknown speaker, as a person an earlier run named is taken
 *   back. A run that assigns a roster person keeps the label behind the
 *   person's name, so the label goes back once the person is taken back too.
 * - A tag that loses its person also loses the import's raw SPEAKER_<n> label,
 *   which only ever stood behind a person's name.
 */
function targetAssignment(
    tag: IdentifiedTag,
    assignment: { personId: string | null; personSetBy: SpeakerAssignmentSource | null },
    unlisted: UnlistedSpeakerHint | undefined,
    unknownLabels: { next: () => string },
): TagAssignment {
    if (assignment.personId !== null) return { ...assignment, label: tag.label };

    // A name on a tag the transcript decided is the transcript's: a reviewer's
    // edit records 'user', whether it chose a person or typed a label.
    const labelledByEarlierRun = tag.personSetBy === 'transcript' && !isPlaceholderLabel(tag.label);
    if (unlisted?.actionable === true && (labelledByEarlierRun || isPlaceholderLabel(tag.label))) {
        return { personId: null, personSetBy: 'transcript', label: unlisted.name };
    }
    const losesAssignment = tag.personId !== null || tag.personSetBy !== null;
    if (losesAssignment && (labelledByEarlierRun || RAW_SPEAKER_LABEL.test(tag.label ?? ''))) {
        return { personId: null, personSetBy: null, label: unknownLabels.next() };
    }
    return { ...assignment, label: tag.label };
}

/**
 * Stores the transcript identification of every speaker tag of the task's
 * meeting, and assigns the person the identifications add up to (see
 * reconcileSpeakerIdentifications), or the label of a speaker who is not on
 * the roster (see targetAssignment).
 *
 * - The hints describe the whole meeting: a tag the result does not name loses
 *   the transcript identification an earlier run gave it.
 * - A tag gets one transcript opinion. When the result names a tag in both
 *   arrays, the roster person wins: the unlisted hint is dropped.
 * - A superseded result never gets here: handleFixTranscriptResult ignores it
 *   whole, since its tag ids and opinions describe a transcript that is gone.
 * - A reviewer's tag keeps its person and its label: every edit records itself
 *   on the tag, removing a name included. So does every tag of a meeting whose
 *   review is complete: a reviewer who agrees with a name leaves the tag
 *   untouched, so an untouched tag there is a confirmed one. The
 *   identifications are still stored, for the reviewer to see.
 * - A review that has started and not finished freezes nothing but the tags it
 *   touched. A run may still name an unknown speaker there, and the reviewer
 *   sees that name as they would have had the run come first.
 * - A hint for a tag that no longer exists, or for a person who is not in the
 *   city, is dropped.
 * - An unlisted hint the task would not act on is stored and changes nothing.
 */
export async function applySpeakerHints(
    taskId: string,
    speakerHints: SpeakerHint[],
    unlistedSpeakerHints: UnlistedSpeakerHint[] = [],
): Promise<void> {
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        select: { cityId: true, councilMeetingId: true, councilMeeting: { select: { city: { select: { realm: true } } } } },
    });
    if (!task) {
        throw new Error('Task not found');
    }
    const { cityId, councilMeetingId: meetingId } = task;

    const [tags, people, pipelineRuns] = await Promise.all([
        prisma.speakerTag.findMany({
            where: { speakerSegments: { some: { cityId, meetingId } } },
            select: identifiedTagSelect,
        }),
        prisma.person.findMany({
            where: { cityId, id: { in: speakerHints.map(hint => hint.personId) } },
            select: { id: true },
        }),
        prisma.taskStatus.findMany({
            where: { cityId, councilMeetingId: meetingId, status: 'succeeded', type: { in: ['transcribe', 'humanReview'] } },
            select: { type: true, createdAt: true },
        }),
    ]);

    // A review counts for the transcript it looked at: a re-transcribe replaces
    // every tag, and the earlier review says nothing about the new ones.
    const lastTranscribe = Math.max(0, ...pipelineRuns.filter(run => run.type === 'transcribe').map(run => run.createdAt.getTime()));
    const reviewCompleted = pipelineRuns.some(run => run.type === 'humanReview' && run.createdAt.getTime() > lastTranscribe);

    const knownPersonIds = new Set(people.map(person => person.id));
    const hintByTagId = new Map(
        speakerHints.filter(hint => knownPersonIds.has(hint.personId)).map(hint => [hint.speakerTagId, hint])
    );
    const unlistedByTagId = new Map(
        unlistedSpeakerHints.filter(hint => !hintByTagId.has(hint.speakerTagId)).map(hint => [hint.speakerTagId, hint])
    );

    const unknownLabels = unknownSpeakerLabels(tags.map(tag => tag.label), task.councilMeeting.city.realm);

    let stored = 0;
    let assigned = 0;
    for (const tag of tags) {
        const hint = hintByTagId.get(tag.id);
        const unlisted = unlistedByTagId.get(tag.id);
        const given = hint ? transcriptIdentification(hint) : unlisted ? transcriptIdentification(unlisted) : null;
        const previous = tag.identifications.find(identification => identification.method === 'transcript') ?? null;
        const otherMethods: MethodIdentification[] = tag.identifications
            .filter(identification => identification.method !== 'transcript')
            .flatMap(({ method, personId, actionable }) => personId === null ? [] : [{ method, personId, actionable }]);

        // The transcript's opinion is stored as given, whoever owns the tag.
        if (given) {
            const unchanged = previous !== null
                && (Object.keys(given) as (keyof typeof given)[]).every(key => given[key] === previous[key]);
            if (!unchanged) {
                await prisma.speakerIdentification.upsert({
                    where: { speakerTagId_method: { speakerTagId: tag.id, method: 'transcript' } },
                    create: { speakerTagId: tag.id, method: 'transcript', ...given },
                    update: given,
                });
                stored++;
            }
        } else if (previous) {
            await prisma.speakerIdentification.deleteMany({ where: { speakerTagId: tag.id, method: 'transcript' } });
            stored++;
        }

        if (reviewCompleted || isReviewerAssignment(tag)) continue;

        const assignment = reconcileSpeakerIdentifications([
            ...otherMethods,
            ...(hint ? [{ method: 'transcript' as const, personId: hint.personId, actionable: hint.actionable === true }] : []),
        ]);
        const target = targetAssignment(tag, assignment, unlisted, unknownLabels);
        if (target.personId === tag.personId && target.personSetBy === tag.personSetBy && target.label === tag.label) continue;

        // Guarded: a reviewer who took the tag in the meantime keeps it.
        const { count } = await prisma.speakerTag.updateMany({
            where: { id: tag.id, ...automaticAssignmentWhere },
            data: {
                personId: target.personId,
                personSetBy: target.personSetBy,
                ...(target.label !== tag.label ? { label: target.label } : {}),
            },
        });
        assigned += count;
    }

    const received = speakerHints.length + unlistedSpeakerHints.length;
    const dropped = received - tags.filter(tag => hintByTagId.has(tag.id) || unlistedByTagId.has(tag.id)).length;
    console.log(
        `Speaker hints for ${cityId}/${meetingId}: ${speakerHints.length} received, ${unlistedSpeakerHints.length} unlisted, ` +
        `${stored} identifications stored or removed, ` +
        `${assigned} assignments changed${reviewCompleted ? ' (none allowed: the review is complete)' : ''}` +
        `${dropped > 0 ? `, ${dropped} dropped (unknown tag or person, or an unlisted hint on a roster person's tag)` : ''}`
    );
}
