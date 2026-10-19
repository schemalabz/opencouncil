/** @jest-environment node */
import { Prisma } from '@prisma/client';
import { createMeetingWithEffects } from '@/lib/meetingWrites';
import { createMeetingRecord } from '@/lib/db/meetingLifecycle';
import { generateUniqueMeetingId } from '@/lib/db/meetings';
import { ConflictError } from '@/lib/api/errors';

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
