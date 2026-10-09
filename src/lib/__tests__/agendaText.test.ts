/** @jest-environment node */

const mockTaskCreate = jest.fn();
const mockNotify = jest.fn();
const mockAiChat = jest.fn();
const mockSave = jest.fn();
const mockMeetingFindUnique = jest.fn();

jest.mock('@/lib/ai', () => ({ aiChat: (...args: unknown[]) => mockAiChat(...args) }));
jest.mock('@/lib/db/meetings', () => ({ getMeetingForAgendaText: (...args: unknown[]) => mockMeetingFindUnique(...args) }));
jest.mock('@/lib/db/topics', () => ({ getTopics: jest.fn().mockResolvedValue([{ name: 'Παιδεία', description: 'Σχολεία' }, { name: 'Αθλητισμός', description: '' }]) }));
jest.mock('@/lib/db/people', () => ({
    getPeopleForMeeting: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Μαρία Νεανίδη', roles: [] }]),
}));
jest.mock('@/lib/db/utils', () => ({ saveSubjectsForMeeting: (...args: unknown[]) => mockSave(...args) }));
jest.mock('@/lib/cache', () => ({ revalidateMeeting: jest.fn() }));
jest.mock('@/lib/subjectImages', () => ({ generateImagesForMeeting: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/db/tasksInternal', () => ({ recordAgendaTextTask: (...args: unknown[]) => mockTaskCreate(...args) }));
jest.mock('@/lib/notifications/meetingTask', () => ({ notifyMeetingSubjects: (...args: unknown[]) => mockNotify(...args) }));
jest.mock('@/lib/utils', () => ({ getRoleNameForPerson: () => 'Μέλος', getPartyFromRoles: () => null }));

import { agendaSubjectsFromExtraction, processAgendaText } from '../agendaText';

const scope = { topicNames: new Set(['Παιδεία']), personIds: new Set(['p1']) };

describe('agendaSubjectsFromExtraction', () => {
    it('numbers the items in the order of the agenda and keeps only known topics and people', () => {
        const subjects = agendaSubjectsFromExtraction({
            subjects: [
                { name: ' Σχολικές αυλές ', description: 'Άνοιγμα των αυλών', topicLabel: 'Παιδεία', introducedByPersonId: 'p1', agendaItemTitle: '1. Σχολικές αυλές' },
                { name: 'Γήπεδο', description: 'x', topicLabel: 'Άγνωστο', introducedByPersonId: 'nobody', withdrawn: true },
            ],
        }, scope);

        expect(subjects).toHaveLength(2);
        expect(subjects[0]).toMatchObject({
            name: 'Σχολικές αυλές', agendaItemIndex: 1, agendaItemTitle: '1. Σχολικές αυλές',
            topicLabel: 'Παιδεία', introducedByPersonId: 'p1', withdrawn: false, agendaSection: null,
            speakerContributions: [], location: null, context: null,
        });
        expect(subjects[1]).toMatchObject({ agendaItemIndex: 2, topicLabel: null, introducedByPersonId: null, withdrawn: true, agendaItemTitle: 'Γήπεδο' });
    });

    it('gives each section an index in the order it first appears', () => {
        const subjects = agendaSubjectsFromExtraction({
            subjects: [
                { name: 'A', description: '', section: 'Θέματα Προεδρείου' },
                { name: 'B', description: '', section: 'Θέματα Μελών' },
                { name: 'C', description: '', section: 'Θέματα Προεδρείου' },
            ],
        }, scope);
        expect(subjects.map(subject => subject.agendaSection)).toEqual([
            { index: 0, title: 'Θέματα Προεδρείου' },
            { index: 1, title: 'Θέματα Μελών' },
            { index: 0, title: 'Θέματα Προεδρείου' },
        ]);
    });

    it('drops an entry without a name, which the model must not return', () => {
        expect(agendaSubjectsFromExtraction({ subjects: [{ name: '', description: 'x' }, { name: 'B', description: '' }] }, scope))
            .toHaveLength(1);
    });
});

const MEETING = {
    id: 'youth_feb14_2026',
    cityId: 'chania',
    name: null,
    name_en: null,
    kind: 'regular',
    sessionNumber: null,
    dateTime: new Date('2026-02-14T16:00:00Z'),
    administrativeBodyId: 'youth',
    administrativeBody: { name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', notificationBehavior: 'NOTIFICATIONS_AUTO' },
    city: { name: 'Χανιά', name_en: 'Chania', language: 'el', realm: 'greece', timezone: 'Europe/Athens' },
};

describe('processAgendaText', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockMeetingFindUnique.mockResolvedValue(MEETING);
        mockAiChat.mockResolvedValue({ result: { subjects: [{ name: 'Σχολικές αυλές', description: '', topicLabel: 'Παιδεία' }] }, usage: {} });
        mockSave.mockResolvedValue(new Map());
        mockTaskCreate.mockResolvedValue({ id: 'task1' });
        mockNotify.mockResolvedValue(undefined);
    });

    it('hands the model the roster, the topics and the text, and saves the items as the agenda', async () => {
        const result = await processAgendaText('chania', 'youth_feb14_2026', '1. Σχολικές αυλές');

        const [, userPrompt] = mockAiChat.mock.calls[0];
        const prompt = JSON.parse(userPrompt);
        expect(prompt).toMatchObject({ body: 'Δημοτικό Συμβούλιο Νέων', agendaText: '1. Σχολικές αυλές' });
        expect(prompt.people).toEqual([{ id: 'p1', name: 'Μαρία Νεανίδη', role: 'Μέλος', party: null }]);
        expect(prompt.topicLabels.map((topic: { name: string }) => topic.name)).toEqual(['Παιδεία', 'Αθλητισμός']);

        expect(mockSave).toHaveBeenCalledWith(
            [expect.objectContaining({ name: 'Σχολικές αυλές', agendaItemIndex: 1, topicLabel: 'Παιδεία' })],
            'chania', 'youth_feb14_2026', undefined, { pruneUnmatched: true },
        );
        expect(result).toEqual({ saved: 1 });
    });

    it('records a succeeded processAgenda task with the subjects, then notifies the followers of the body', async () => {
        await processAgendaText('chania', 'youth_feb14_2026', '1. Σχολικές αυλές');

        // The row is what the task list, a re-run and the Notis view read.
        expect(mockTaskCreate).toHaveBeenCalledWith('chania', 'youth_feb14_2026', '1. Σχολικές αυλές', mockSave.mock.calls[0][0]);
        expect(mockNotify).toHaveBeenCalledWith(MEETING, 'beforeMeeting');
        expect(mockTaskCreate.mock.invocationCallOrder[0]).toBeGreaterThan(mockSave.mock.invocationCallOrder[0]);
        expect(mockNotify.mock.invocationCallOrder[0]).toBeGreaterThan(mockTaskCreate.mock.invocationCallOrder[0]);
    });

    it('fails for a meeting that does not exist, before any model call', async () => {
        mockMeetingFindUnique.mockResolvedValue(null);
        await expect(processAgendaText('chania', 'nope', 'x')).rejects.toThrow('not found');
        expect(mockAiChat).not.toHaveBeenCalled();
    });
});
