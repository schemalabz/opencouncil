/** @jest-environment node */
import { Prisma } from '@prisma/client';
import { createMeetingWithEffects, updateMeetingWithEffects } from '@/lib/meetingWrites';
import { createMeetingRecord, updateMeetingRecord } from '@/lib/db/meetingLifecycle';
import { generateUniqueMeetingId } from '@/lib/db/meetings';
import { BadRequestError, ConflictError } from '@/lib/api/errors';
import { processAgendaText } from '@/lib/agendaText';
import { reportFailure } from '@/lib/reportFailure';

jest.mock('next/server', () => ({ after: (fn: () => unknown) => { void fn(); } }));
jest.mock('@/lib/db/meetingLifecycle', () => ({ createMeetingRecord: jest.fn(), updateMeetingRecord: jest.fn() }));
jest.mock('@/lib/db/meetings', () => ({
    generateUniqueMeetingId: jest.fn(),
    getCouncilMeetingDirect: jest.fn(),
    upcomingMeetingsTag: jest.fn(),
}));
jest.mock('@/lib/db/citiesAdmin', () => ({ getCityNameEnAndTimezone: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: jest.fn() }));
jest.mock('@/lib/db/subject', () => ({ landingSubjectsTag: jest.fn() }));
jest.mock('@/lib/discord', () => ({ sendMeetingCreatedAdminAlert: jest.fn() }));
jest.mock('@/lib/google-calendar', () => ({ syncMeetingToCalendar: jest.fn() }));
jest.mock('@/lib/tasks/processAgendaInternal', () => ({ requestProcessAgendaInternal: jest.fn() }));
jest.mock('@/lib/cache/afterResponse', () => ({ revalidateAfterResponse: jest.fn() }));
jest.mock('@/lib/agendaText', () => ({ processAgendaText: jest.fn().mockResolvedValue({ saved: 0 }) }));
jest.mock('@/lib/reportFailure', () => ({ reportFailure: jest.fn() }));
jest.mock('@/lib/db/tasksInternal', () => ({ meetingHasSucceededTask: jest.fn().mockResolvedValue(false) }));
jest.mock('@/lib/tasks/transcribeInternal', () => ({ requestTranscribeInternal: jest.fn() }));

const createRecord = createMeetingRecord as jest.Mock;
const generateId = generateUniqueMeetingId as jest.Mock;

const uniqueViolation = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
});

beforeEach(() => {
    jest.clearAllMocks();
    generateId.mockResolvedValue('generated-id');
});

describe('createMeetingWithEffects', () => {
    it('refuses a typed id that another meeting holds with a ConflictError', async () => {
        createRecord.mockRejectedValue(uniqueViolation());

        const write = createMeetingWithEffects('athens', { date: new Date('2026-10-01T09:00:00Z'), meetingId: 'oct1_2026' });

        await expect(write).rejects.toThrow(ConflictError);
        await expect(write).rejects.toThrow('A meeting with the id "oct1_2026" already exists.');
        expect(createRecord).toHaveBeenCalledTimes(1);
    });

    it('retries with a new generated id when the generated id was taken', async () => {
        createRecord.mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce({ id: 'generated-id' });

        await createMeetingWithEffects('athens', { date: new Date('2026-10-01T09:00:00Z') });

        expect(createRecord).toHaveBeenCalledTimes(2);
        expect(generateId).toHaveBeenCalledTimes(2);
    });
});

describe('a pasted agenda takes the place of the agenda link (#829)', () => {
    const updateRecord = updateMeetingRecord as jest.Mock;
    const date = new Date('2026-10-01T09:00:00Z');
    const link = 'https://example.org/agenda.pdf';

    beforeEach(() => updateRecord.mockResolvedValue({ id: 'oct1_2026', youtubeUrl: null, administrativeBody: null }));

    it('stores no link beside the text on an edit', async () => {
        await updateMeetingWithEffects('athens', 'oct1_2026', { agendaText: '1. Θέμα' });
        expect(updateRecord.mock.calls[0][2]).toEqual({ agendaUrl: null });
    });

    it('keeps the stored link when the edit sends neither', async () => {
        await updateMeetingWithEffects('athens', 'oct1_2026', { place: 'Αίθουσα' });
        expect(updateRecord.mock.calls[0][2]).toEqual({ place: 'Αίθουσα' });
    });

    it('refuses a link and a text together, on create and on edit, and writes nothing', async () => {
        await expect(createMeetingWithEffects('athens', { date, agendaUrl: link, agendaText: '1. Θέμα' })).rejects.toThrow(BadRequestError);
        await expect(updateMeetingWithEffects('athens', 'oct1_2026', { agendaUrl: link, agendaText: '1. Θέμα' })).rejects.toThrow(BadRequestError);
        expect(createRecord).not.toHaveBeenCalled();
        expect(updateRecord).not.toHaveBeenCalled();
    });
});

describe('the steps that run after the response', () => {
    it('alert the operators when the pasted agenda cannot be read: nothing else reports it', async () => {
        (updateMeetingRecord as jest.Mock).mockResolvedValue({ id: 'oct1_2026', youtubeUrl: null, administrativeBody: null });
        (processAgendaText as jest.Mock).mockRejectedValueOnce(new Error('The answer of the model does not match its schema'));

        await updateMeetingWithEffects('athens', 'oct1_2026', { agendaText: '1. Θέμα' });
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(reportFailure).toHaveBeenCalledWith('Pasted agenda', 'Failed to extract the pasted agenda of athens/oct1_2026', expect.any(Error), { cityId: 'athens', meetingId: 'oct1_2026' });
    });
});
