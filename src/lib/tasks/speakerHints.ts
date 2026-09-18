/**
 * Applies the transcript speaker hints a fixTranscript result carries.
 *
 * NOT in a "use server" file: this writes speaker assignments, and must not be
 * callable as a Server Action. It runs on the task-server callback only.
 */
import "server-only";
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { SpeakerHint } from '@/lib/apiTypes';
import { isReviewerAssignment, reconcileSpeakerIdentifications, MethodIdentification } from '@/lib/speakerIdentifications';
import { buildUnknownSpeakerLabel, UNKNOWN_SPEAKER_LABEL } from '@/lib/utils';

/**
 * The tags isReviewerAssignment leaves open, as a query. It guards the write
 * itself, so a reviewer who takes a tag while the hints are being applied still
 * wins. Spelled positively: in SQL, NOT over a nullable column drops the NULL
 * rows, which are exactly the untouched tags.
 */
const automaticAssignmentWhere = {
    OR: [
        { personSetBy: { in: ['voiceprint', 'transcript', 'both'] } },
        { personSetBy: null, personId: null },
    ],
} satisfies Prisma.SpeakerTagWhereInput;

/** The label the transcribe import gives a voiceprint-matched speaker. */
const RAW_SPEAKER_LABEL = /^SPEAKER_\d+$/;

/** Hands out "unknown speaker N" labels that continue the meeting's numbering. */
function unknownSpeakerLabels(existingLabels: (string | null)[]) {
    const numbered = new RegExp(`^${UNKNOWN_SPEAKER_LABEL} (\\d+)$`);
    let last = Math.max(0, ...existingLabels.map(label => Number(label?.match(numbered)?.[1] ?? 0)));
    return { next: () => buildUnknownSpeakerLabel(++last) };
}

const identifiedTagSelect = {
    id: true,
    label: true,
    personId: true,
    personSetBy: true,
    identifications: {
        select: { method: true, personId: true, actionable: true, evidenceKind: true, confidence: true, evidence: true },
    },
} satisfies Prisma.SpeakerTagSelect;

/** What a hint stores as the tag's transcript identification. */
function transcriptIdentification(hint: SpeakerHint) {
    return {
        personId: hint.personId,
        // Only an explicit yes: a hint that does not say is one nobody acts on.
        actionable: hint.actionable === true,
        evidenceKind: hint.evidenceKind ?? null,
        confidence: hint.confidence,
        evidence: hint.evidence,
    };
}

/**
 * Stores the transcript identification of every speaker tag of the task's
 * meeting, and assigns the person the identifications add up to (see
 * reconcileSpeakerIdentifications).
 *
 * - The hints describe the whole meeting: a tag the result does not name loses
 *   the transcript identification an earlier run gave it.
 * - A superseded result never gets here: handleFixTranscriptResult ignores it
 *   whole, since its tag ids and opinions describe a transcript that is gone.
 * - A reviewer's tag keeps its person. So does every tag of a meeting a reviewer
 *   is working on or has finished: a reviewer who agrees with a name leaves the
 *   tag untouched, so an untouched tag there may be a confirmed one. The
 *   identifications are still stored, for the reviewer to see.
 * - A hint for a tag that no longer exists, or for a person who is not in the
 *   city, is dropped.
 * - A tag that loses its person (the methods disagree) also loses the import's
 *   raw SPEAKER_<n> label, which only ever stood behind a person's name: readers
 *   see an unknown speaker, as for any speaker nobody has identified.
 */
export async function applySpeakerHints(taskId: string, speakerHints: SpeakerHint[]): Promise<void> {
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        select: { cityId: true, councilMeetingId: true },
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
    const reviewStarted = tags.some(tag => tag.personSetBy === 'user');

    const knownPersonIds = new Set(people.map(person => person.id));
    const hintByTagId = new Map(
        speakerHints.filter(hint => knownPersonIds.has(hint.personId)).map(hint => [hint.speakerTagId, hint])
    );
    const assignmentsFrozen = reviewCompleted || reviewStarted;

    const unknownLabels = unknownSpeakerLabels(tags.map(tag => tag.label));

    let stored = 0;
    let assigned = 0;
    for (const tag of tags) {
        const hint = hintByTagId.get(tag.id);
        const given = hint ? transcriptIdentification(hint) : null;
        const previous = tag.identifications.find(identification => identification.method === 'transcript') ?? null;
        const otherMethods: MethodIdentification[] = tag.identifications.filter(identification => identification.method !== 'transcript');

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

        if (assignmentsFrozen || isReviewerAssignment(tag)) continue;

        const assignment = reconcileSpeakerIdentifications([
            ...otherMethods,
            ...(given ? [{ method: 'transcript' as const, personId: given.personId, actionable: given.actionable }] : []),
        ]);
        if (assignment.personId === tag.personId && assignment.personSetBy === tag.personSetBy) continue;

        // Guarded: a reviewer who took the tag in the meantime keeps it.
        const { count } = await prisma.speakerTag.updateMany({
            where: { id: tag.id, ...automaticAssignmentWhere },
            data: {
                ...assignment,
                ...(assignment.personId === null && RAW_SPEAKER_LABEL.test(tag.label ?? '') ? { label: unknownLabels.next() } : {}),
            },
        });
        assigned += count;
    }

    const dropped = speakerHints.length - tags.filter(tag => hintByTagId.has(tag.id)).length;
    console.log(
        `Speaker hints for ${cityId}/${meetingId}: ${speakerHints.length} received, ${stored} identifications stored or removed, ` +
        `${assigned} assignments changed${assignmentsFrozen ? ' (none allowed: a reviewer has started or completed the review)' : ''}` +
        `${dropped > 0 ? `, ${dropped} dropped (unknown tag or person)` : ''}`
    );
}
