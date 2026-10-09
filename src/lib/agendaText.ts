// The agenda of a meeting as pasted text (#829). A body with no PDF of its
// agenda pastes the text into the meeting form. The app, not the tasks
// server, extracts the items: the processAgenda task reads a PDF from a URL,
// and a youth council rarely has one. The extraction is lighter than the
// task: it names the items, their topic and who brings them, and pins no
// location.
import "server-only";
import type { Subject } from '@/lib/apiTypes';
import { aiChat } from '@/lib/ai';
import { revalidateMeeting } from '@/lib/cache';
import { getMeetingForAgendaText } from '@/lib/db/meetings';
import { getPeopleForMeeting } from '@/lib/db/people';
import { getTopics } from '@/lib/db/topics';
import { recordAgendaTextTask } from '@/lib/db/tasksInternal';
import { saveSubjectsForMeeting } from '@/lib/db/utils';
import { notifyMeetingSubjects } from '@/lib/notifications/meetingTask';
import { generateImagesForMeeting } from '@/lib/subjectImages';
import { getPartyFromRoles, getRoleNameForPerson } from '@/lib/utils';

/** One item as the model returns it. */
export interface ExtractedAgendaItem {
    name: string;
    description: string;
    /** The item as written on the agenda. */
    agendaItemTitle?: string | null;
    /** The heading the item sits under, when the agenda has sections. */
    section?: string | null;
    topicLabel?: string | null;
    introducedByPersonId?: string | null;
    withdrawn?: boolean;
}

export interface AgendaTextExtraction {
    subjects: ExtractedAgendaItem[];
}

const SYSTEM_PROMPT = `You read the agenda (ημερήσια διάταξη) of a meeting of a local government body and return its items as JSON.

Rules:
- Return ONLY a JSON object of the shape {"subjects": [...]}. No prose, no markdown.
- One entry per agenda item, in the order of the agenda. Keep the numbering of the agenda through that order; do not merge or split items.
- "name": a short title of the item, in the language of the agenda, at most 120 characters, in sentence case.
- "description": one or two sentences that say what the item is about, from the text alone. Do not invent facts.
- "agendaItemTitle": the item exactly as the agenda writes it.
- "section": the heading the item sits under when the agenda has sections, otherwise null.
- "topicLabel": the one label from the given list that fits best, or null.
- "introducedByPersonId": the id of the person from the given roster who brings the item, when the agenda names one, otherwise null. Never an id that is not in the roster.
- "withdrawn": true only when the agenda says the item is withdrawn.
- Skip lines that are not items: the header, the date, the place, the signature, procedural notes.`;

/**
 * The extraction as the save path wants it. Pure, so a test covers the
 * mapping: unknown topics and people fall away, sections get an index in
 * the order they appear, and items keep their position on the agenda.
 */
export function agendaSubjectsFromExtraction(
    extraction: AgendaTextExtraction,
    { topicNames, personIds }: { topicNames: ReadonlySet<string>; personIds: ReadonlySet<string> },
): Subject[] {
    const sectionIndex = new Map<string, number>();
    return extraction.subjects
        .filter(item => typeof item.name === 'string' && item.name.trim().length > 0)
        .map((item, index) => {
            const section = item.section?.trim() || null;
            if (section && !sectionIndex.has(section)) sectionIndex.set(section, sectionIndex.size);
            return {
                name: item.name.trim(),
                description: typeof item.description === 'string' ? item.description.trim() : '',
                agendaItemTitle: item.agendaItemTitle?.trim() || item.name.trim(),
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
 * meeting write; a failure is logged and leaves the meeting without subjects,
 * and the admin pastes the text again.
 *
 * The saved agenda has the effects of the task's: a succeeded processAgenda
 * row, which the task list shows, a re-run replays (processTaskResponse
 * reads the subjects from it) and the Notis view reads for its agenda event;
 * and the notifications of the body, before the meeting.
 */
export async function processAgendaText(cityId: string, meetingId: string, text: string): Promise<{ saved: number }> {
    const meeting = await getMeetingForAgendaText(cityId, meetingId);
    if (!meeting) throw new Error(`Meeting ${cityId}/${meetingId} not found`);

    const [people, topics] = await Promise.all([
        getPeopleForMeeting(cityId, meeting.administrativeBodyId),
        getTopics(meeting.city.realm),
    ]);
    const roster = people.map(person => ({
        id: person.id,
        name: person.name,
        role: getRoleNameForPerson(person.roles, meeting.dateTime, meeting.administrativeBodyId ?? undefined),
        party: getPartyFromRoles(person.roles, meeting.dateTime)?.name ?? null,
    }));

    const userPrompt = JSON.stringify({
        body: meeting.administrativeBody?.name ?? null,
        city: meeting.city.name,
        language: meeting.city.language,
        date: meeting.dateTime.toISOString(),
        topicLabels: topics.map(topic => ({ name: topic.name, description: topic.description })),
        people: roster,
        agendaText: text,
    }, null, 2);

    const { result } = await aiChat<AgendaTextExtraction>(SYSTEM_PROMPT, userPrompt, undefined, undefined, { maxTokens: 8192 });
    const subjects = agendaSubjectsFromExtraction(result, {
        topicNames: new Set(topics.map(topic => topic.name)),
        personIds: new Set(people.map(person => person.id)),
    });

    await saveSubjectsForMeeting(subjects, cityId, meetingId, undefined, { pruneUnmatched: true });
    revalidateMeeting(cityId, meetingId);
    await recordAgendaTextTask(cityId, meetingId, text, subjects);
    await notifyMeetingSubjects(meeting, 'beforeMeeting');
    await generateImagesForMeeting(cityId, meetingId);
    return { saved: subjects.length };
}
