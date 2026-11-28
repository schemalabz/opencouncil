/** @jest-environment node */
import { requestProcessAgendaInternal } from '../processAgendaInternal';

// The request that goes to the task backend names the kind of the authority
// (#993). The backend words its prompts for a region from this field, so a
// builder that sends a fixed value gives a region the prompts of a municipality.

const mockFindUnique = jest.fn();
jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: { councilMeeting: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));
const mockStartTask = jest.fn().mockResolvedValue({ id: 'task-1' });
jest.mock('../tasks', () => ({ startTask: (...args: unknown[]) => mockStartTask(...args) }));
jest.mock('../../db/topics', () => ({ getTopics: jest.fn().mockResolvedValue([]) }));
jest.mock('../../db/people', () => ({ getPeopleForMeeting: jest.fn().mockResolvedValue([]) }));
jest.mock('@/i18n/roleTitles', () => ({ getRoleTitles: jest.fn().mockResolvedValue({}) }));
jest.mock('../speakerRoster', () => ({ buildAgendaRoster: () => [] }));

function meetingOf(authorityType: 'municipality' | 'region', name: string) {
    return {
        id: 'm1', cityId: 'c1', dateTime: new Date('2026-03-04T16:00:00Z'), administrativeBodyId: 'council',
        subjects: [], administrativeBody: { name: 'Συμβούλιο', type: 'council' },
        city: { name, language: 'el', authorityType, realm: 'greece', timezone: 'Europe/Athens' },
    };
}

describe('the processAgenda request', () => {
    beforeEach(() => {
        mockStartTask.mockClear();
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    it.each([
        ['region', 'Θεσσαλία'],
        ['municipality', 'Χαλάνδρι'],
    ] as const)('names a %s as the kind of the authority', async (authorityType, name) => {
        mockFindUnique.mockResolvedValue(meetingOf(authorityType, name));

        await requestProcessAgendaInternal('https://example.org/agenda.pdf', 'm1', 'c1');

        expect(mockStartTask).toHaveBeenCalledWith(
            'processAgenda', expect.objectContaining({ cityName: name, authorityType }), 'm1', 'c1', { force: false });
    });
});
