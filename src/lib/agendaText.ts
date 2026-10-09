// The agenda of a meeting as pasted text (#829). A body with no PDF of its
// agenda pastes the text into the meeting form. The app, not the tasks
// server, extracts the items: the processAgenda task reads a PDF from a URL,
// and a youth council rarely has one. The extraction is lighter than the
// task: it names the items, their topic and who brings them, and pins no
// location.
import "server-only";
import * as z from 'zod';
import type { Subject } from '@/lib/apiTypes';
import { aiChat } from '@/lib/ai';
import { jsonSchemaOf } from '@/lib/promptJsonSchema';
import { revalidateMeeting } from '@/lib/cache';
import { getMeetingForAgendaText } from '@/lib/db/meetings';
import { getPeopleForMeeting } from '@/lib/db/people';
import { getTopics } from '@/lib/db/topics';
import { recordAgendaTextTask } from '@/lib/db/tasksInternal';
import { saveSubjectsForMeeting } from '@/lib/db/utils';
import { notifySubscribersOfTask } from '@/lib/notifications/meetingNotifications';
import { generateImagesForMeeting } from '@/lib/subjectImages';
import { buildAgendaRoster } from '@/lib/tasks/speakerRoster';
import { getRoleTitles } from '@/i18n/roleTitles';

/** The model's answer: one entry per item of the agenda. The prompt gives the model this schema. */
export const agendaExtractionSchema = z.object({
    subjects: z.array(z.object({
        // Nullish, so that one item without a name drops alone and does not refuse the whole answer.
        name: z.string().trim().nullish(),
        description: z.string().trim().nullish(),
        /** The item as written on the agenda. */
        agendaItemTitle: z.string().trim().nullish(),
        /** The heading the item sits under, when the agenda has sections. */
        section: z.string().trim().nullish(),
        topicLabel: z.string().nullish(),
        introducedByPersonId: z.string().nullish(),
        withdrawn: z.boolean().nullish(),
    })),
});

export type AgendaTextExtraction = z.output<typeof agendaExtractionSchema>;

const SYSTEM_PROMPT = `You read the agenda (ημερήσια διάταξη) of a meeting of a local government body and return its items as JSON.

Rules:
- Return ONLY a JSON object that matches the schema below. No prose, no markdown.
- One entry per agenda item, in the order of the agenda. Keep the numbering of the agenda through that order; do not merge or split items.
- "name": a short title of the item, in the language of the agenda, at most 120 characters, in sentence case.
- "description": one or two sentences that say what the item is about, from the text alone. Do not invent facts.
- "agendaItemTitle": the item exactly as the agenda writes it.
- "section": the heading the item sits under when the agenda has sections, otherwise null.
- "topicLabel": the one label from the given list that fits best, or null.
- "introducedByPersonId": the id of the person from the given roster who brings the item, when the agenda names one, otherwise null. Never an id that is not in the roster.
- "withdrawn": true only when the agenda says the item is withdrawn.
- Skip lines that are not items: the header, the date, the place, the signature, procedural notes.

JSON SCHEMA:
${JSON.stringify(jsonSchemaOf(agendaExtractionSchema), null, 2)}`;

/**
 * The checked extraction as the save path wants it. Pure, so a test covers
 * the mapping: unknown topics and people fall away, sections get an index in
 * the order they appear, and items keep their position on the agenda.
 */
export function agendaSubjectsFromExtraction(
    extraction: AgendaTextExtraction,
    { topicNames, personIds }: { topicNames: ReadonlySet<string>; personIds: ReadonlySet<string> },
): Subject[] {
    const sectionIndex = new Map<string, number>();
    return extraction.subjects
        .filter((item): item is typeof item & { name: string } => !!item.name)
        .map((item, index) => {
            const section = item.section || null;
            if (section && !sectionIndex.has(section)) sectionIndex.set(section, sectionIndex.size);
            return {
                name: item.name,
                description: item.description ?? '',
                agendaItemTitle: item.agendaItemTitle || item.name,
                agendaSection: section ? { index: sectionIndex.get(section)!, title: section } : null,
                agendaItemIndex: index + 1,
                introducedByPersonId: item.introducedByPersonId && personIds.has(item.introducedByPersonId) ? item.introducedByPersonId : null,
                speakerContributions: [],
                topicImportance: 'normal',
                proximityImportance: 'none',
                location: null,
                topicLabel: item.topicLabel && topicNames.has(item.topicLabel) ? item.topicLabel : null,
                context: null,
                withdrawn: item.withdrawn === true,
            };
        });
}

/**
 * Extract the items of a pasted agenda and save them as the subjects of the
 * meeting. The agenda is authoritative, as for the processAgenda task: items
 * that the text no longer holds are pruned. Runs after the response of the
 * meeting write; the caller reports a failure on Discord (reportFailure). The
 * meeting then has no subjects, and the admin pastes the text again.
 *
 * The saved agenda has the effects of the task's: a succeeded processAgenda
 * row, which the task list shows, a re-run replays (processTaskResponse
 * reads the subjects from it) and the Notis view reads for its agenda event;
 * and the notifications of the body, before the meeting.
 */
export async function processAgendaText(cityId: string, meetingId: string, text: string): Promise<{ saved: number }> {
    const meeting = await getMeetingForAgendaText(cityId, meetingId);
    if (!meeting) throw new Error(`Meeting ${cityId}/${meetingId} not found`);
    // After the summary, the subjects hold the discussion, and the save below
    // would replace it: an agenda has no statements, and saveSubjectsForMeeting
    // writes the statements of the incoming set. An agenda belongs before the
    // meeting; a summarized meeting is corrected through its summary.
    if (meeting.taskStatuses.length > 0) {
        throw new Error(`Meeting ${cityId}/${meetingId} has a summary; a pasted agenda does not replace it`);
    }

    const [people, topics, roleTitles] = await Promise.all([
        getPeopleForMeeting(cityId, meeting.administrativeBodyId, meeting.dateTime),
        getTopics(meeting.city.realm),
        getRoleTitles(meeting.city.language),
    ]);
    const roster = buildAgendaRoster(people, meeting.dateTime, meeting.administrativeBodyId, roleTitles);

    const userPrompt = JSON.stringify({
        body: meeting.administrativeBody?.name ?? null,
        city: meeting.city.name,
        language: meeting.city.language,
        date: meeting.dateTime.toISOString(),
        topicLabels: topics.map(topic => ({ name: topic.name, description: topic.description })),
        people: roster,
        agendaText: text,
    }, null, 2);

    const { result } = await aiChat<unknown>(SYSTEM_PROMPT, userPrompt, undefined, undefined, { maxTokens: 8192 });
    const extraction = agendaExtractionSchema.safeParse(result);
    if (!extraction.success) {
        throw new Error(`The answer of the model for the agenda of ${cityId}/${meetingId} does not match its schema: ${z.prettifyError(extraction.error)}`);
    }
    const subjects = agendaSubjectsFromExtraction(extraction.data, {
        topicNames: new Set(topics.map(topic => topic.name)),
        personIds: new Set(people.map(person => person.id)),
    });

    await saveSubjectsForMeeting(subjects, cityId, meetingId, undefined, { pruneUnmatched: true });
    revalidateMeeting(cityId, meetingId);
    await recordAgendaTextTask(cityId, meetingId, text, subjects);
    // The pasted agenda is a succeeded processAgenda, so it notifies as one
    // (see notifySubscribersOfTask): the release notifies for an unreleased meeting.
    await notifySubscribersOfTask(cityId, meetingId, 'processAgenda');
    await generateImagesForMeeting(cityId, meetingId);
    return { saved: subjects.length };
}
