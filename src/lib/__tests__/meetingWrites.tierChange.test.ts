/** @jest-environment node */

/**
 * A public meeting that moves between the two tiers (#829) can give its city
 * the only public route it has, or take it away: the update busts the city
 * lists, and the calendar event follows the tier.
 */
const mockRevalidateAfterResponse = jest.fn();
const mockSyncMeetingToCalendar = jest.fn();
const mockUpdateMeetingRecord = jest.fn();
const mockGetCouncilMeetingDirect = jest.fn();
const mockCreateMeetingRecord = jest.fn();
const mockMeetingCreatedAlert = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('next/server', () => ({ after: jest.fn() }));
jest.mock('@/lib/db/citiesAdmin', () => ({ getCityNameEnAndTimezone: jest.fn().mockResolvedValue({ name_en: 'Chania', timezone: 'Europe/Athens' }) }));
jest.mock('@/lib/db/meetings', () => ({
    generateUniqueMeetingId: jest.fn().mockResolvedValue('oct9_2026'),
    getCouncilMeetingDirect: (...args: unknown[]) => mockGetCouncilMeetingDirect(...args),
    upcomingMeetingsTag: (realm: string) => `realm:${realm}:upcoming-meetings`,
}));
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/db/subject', () => ({ landingSubjectsTag: (realm: string) => `realm:${realm}:landing-subjects` }));
jest.mock('@/lib/db/meetingLifecycle', () => ({
    createMeetingRecord: (...args: unknown[]) => mockCreateMeetingRecord(...args),
    updateMeetingRecord: (...args: unknown[]) => mockUpdateMeetingRecord(...args),
}));
jest.mock('@/lib/discord', () => ({ sendMeetingCreatedAdminAlert: (...args: unknown[]) => mockMeetingCreatedAlert(...args) }));
jest.mock('@/lib/google-calendar', () => ({ syncMeetingToCalendar: (...args: unknown[]) => mockSyncMeetingToCalendar(...args) }));
jest.mock('@/lib/tasks/processAgendaInternal', () => ({ requestProcessAgendaInternal: jest.fn() }));
jest.mock('@/lib/cache/afterResponse', () => ({ revalidateAfterResponse: (...args: unknown[]) => mockRevalidateAfterResponse(...args) }));
jest.mock('@/lib/agendaText', () => ({ processAgendaText: jest.fn() }));
jest.mock('@/lib/db/tasksInternal', () => ({ meetingHasSucceededTask: jest.fn().mockResolvedValue(false) }));
jest.mock('@/lib/reportFailure', () => ({ reportFailure: jest.fn() }));
jest.mock('@/lib/tasks/transcribeInternal', () => ({ requestTranscribeInternal: jest.fn() }));

import { createMeetingWithEffects, updateMeetingWithEffects } from '../meetingWrites';

const council = { id: 'council', type: 'council', tier: 'primary', name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', place: null };
const youth = { id: 'youth', type: 'youthCouncil', tier: 'secondary', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', place: null };
const promoted = { ...youth, id: 'promoted', tier: 'primary' };
const company = { ...council, id: 'company', tier: 'secondary', name: 'Ζήρεια Α.Ε.', name_en: 'Zireia S.A.' };

function row(body: typeof council, released: boolean, overrides: Record<string, unknown> = {}) {
    return {
        id: 'oct9_2026', cityId: 'chania', name: null, name_en: null, kind: 'regular', sessionNumber: null,
        dateTime: new Date('2026-10-01T16:00:00Z'), youtubeUrl: null, agendaUrl: null, released,
        scheduleStatus: 'scheduled', scheduleStatusReason: null, format: 'inPerson', closedToPublic: false, noRecording: false,
        place: null, postponedFromId: null, continuationOfId: null, administrativeBodyId: body.id, administrativeBody: body,
        ...overrides,
    };
}

function tags(): string[] {
    return mockRevalidateAfterResponse.mock.calls[0][0].tags;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockSyncMeetingToCalendar.mockResolvedValue(undefined);
});

describe('updateMeetingWithEffects on a change of tier', () => {
    it('busts the city lists when a public meeting leaves the secondary tier, and gives it a calendar event', async () => {
        mockGetCouncilMeetingDirect.mockResolvedValue(row(youth, true));
        mockUpdateMeetingRecord.mockResolvedValue(row(council, true));

        await updateMeetingWithEffects('chania', 'oct9_2026', { administrativeBodyId: 'council' });

        expect(tags()).toEqual(expect.arrayContaining(['cities:all', 'realm:greece:cities:all']));
        expect(mockSyncMeetingToCalendar).toHaveBeenCalledWith('chania', 'oct9_2026', { allowCreate: true });
    });

    it('busts the city lists when a public meeting joins the secondary tier, and creates no event', async () => {
        mockGetCouncilMeetingDirect.mockResolvedValue(row(council, true));
        mockUpdateMeetingRecord.mockResolvedValue(row(youth, true));

        await updateMeetingWithEffects('chania', 'oct9_2026', { administrativeBodyId: 'youth' });

        expect(tags()).toEqual(expect.arrayContaining(['cities:all']));
        expect(mockSyncMeetingToCalendar).toHaveBeenCalledWith('chania', 'oct9_2026', { allowCreate: false });
    });

    it('leaves the city lists alone for a draft that changes tier, and for an edit that keeps the tier', async () => {
        mockGetCouncilMeetingDirect.mockResolvedValue(row(youth, false));
        mockUpdateMeetingRecord.mockResolvedValue(row(council, false));
        await updateMeetingWithEffects('chania', 'oct9_2026', { administrativeBodyId: 'council' });
        expect(tags()).not.toContain('cities:all');

        jest.clearAllMocks();
        mockGetCouncilMeetingDirect.mockResolvedValue(row(council, true));
        mockUpdateMeetingRecord.mockResolvedValue(row(council, true, { place: 'Αίθουσα' }));
        await updateMeetingWithEffects('chania', 'oct9_2026', { place: 'Αίθουσα' });
        expect(tags()).not.toContain('cities:all');
        expect(mockSyncMeetingToCalendar).toHaveBeenCalledWith('chania', 'oct9_2026', { allowCreate: false });
    });
});

// The operators' channel gets the alert of every meeting. The calendar follows the tier.
describe('createMeetingWithEffects on the operators\' channel and the calendar', () => {
    it.each([
        ['a council', council, true],
        ['a youth council at its default tier', youth, false],
        ['a youth council set to primary', promoted, true],
        ['a council set to secondary', company, false],
    ])('for %s: alert, calendar event %s', async (_name, body, calendar) => {
        mockCreateMeetingRecord.mockResolvedValue(row(body, false, { kind: 'ordinary' }));

        await createMeetingWithEffects('chania', { date: new Date('2026-10-01T16:00:00Z'), administrativeBodyId: body.id });

        expect(mockMeetingCreatedAlert).toHaveBeenCalledTimes(1);
        expect(mockSyncMeetingToCalendar).toHaveBeenCalledTimes(calendar ? 1 : 0);
    });
});
