import { syncMeetingToCalendar } from '../google-calendar';
import { getMeetingForCalendarSync, setMeetingCalendarEventId, MeetingForCalendarSync } from '@/lib/db/meetingsCalendarSync';
import { sendTaskAdminAlert } from '@/lib/discord';

const mockInsert = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('googleapis', () => ({
    google: {
        auth: {
            OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: jest.fn() })),
        },
        calendar: jest.fn(() => ({ events: { insert: mockInsert, patch: mockPatch, delete: mockDelete } })),
    },
}));

jest.mock('@/env.mjs', () => ({
    env: {
        GOOGLE_CALENDAR_ENABLED: 'true',
        GOOGLE_CALENDAR_ID: 'cal-123',
        GOOGLE_CALENDAR_CLIENT_ID: 'client-id',
        GOOGLE_CALENDAR_CLIENT_SECRET: 'client-secret',
        GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh-token',
        NEXTAUTH_URL: 'https://opencouncil.gr',
    },
}));

jest.mock('@/lib/db/meetingsCalendarSync', () => ({
    getMeetingForCalendarSync: jest.fn(),
    setMeetingCalendarEventId: jest.fn(),
}));

jest.mock('@/lib/discord', () => ({
    sendTaskAdminAlert: jest.fn().mockResolvedValue(undefined),
}));

const { env } = jest.requireMock('@/env.mjs') as { env: Record<string, string | undefined> };
const mockGetMeeting = getMeetingForCalendarSync as jest.MockedFunction<typeof getMeetingForCalendarSync>;
const mockSetEventId = setMeetingCalendarEventId as jest.MockedFunction<typeof setMeetingCalendarEventId>;
const mockAlert = sendTaskAdminAlert as jest.MockedFunction<typeof sendTaskAdminAlert>;

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

function makeMeeting(overrides: Partial<MeetingForCalendarSync> = {}): MeetingForCalendarSync {
    return {
        id: 'jun5_2026',
        cityId: 'athens',
        name: 'Συνεδρίαση',
        name_en: 'Meeting',
        dateTime: FUTURE,
        youtubeUrl: null,
        agendaUrl: null,
        videoUrl: null,
        audioUrl: null,
        muxPlaybackId: null,
        calendarEventId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        released: false,
        administrativeBodyId: null,
        city: { name: 'Αθήνα', timezone: 'Europe/Athens' },
        administrativeBody: null,
        meetingOperator: null,
        ...overrides,
    } as MeetingForCalendarSync;
}

beforeEach(() => {
    jest.clearAllMocks();
    env.GOOGLE_CALENDAR_ENABLED = 'true';
    env.GOOGLE_CALENDAR_ID = 'cal-123';
    mockInsert.mockResolvedValue({ data: { id: 'evt-1', htmlLink: 'https://cal/evt-1' } });
    mockPatch.mockResolvedValue({ data: { id: 'evt-1' } });
    // clearAllMocks resets calls, not implementations, so a rejection set by one
    // test would otherwise leak into the next.
    mockSetEventId.mockResolvedValue(undefined);
    mockAlert.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue({});
});

describe('syncMeetingToCalendar', () => {
    it('does nothing when the integration is disabled', async () => {
        env.GOOGLE_CALENDAR_ENABLED = undefined;
        await syncMeetingToCalendar('athens', 'jun5_2026', { allowCreate: true });
        expect(mockGetMeeting).not.toHaveBeenCalled();
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it('does nothing when no calendar ID is configured', async () => {
        env.GOOGLE_CALENDAR_ID = undefined;
        await syncMeetingToCalendar('athens', 'jun5_2026', { allowCreate: true });
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it('patches a stored event for a past meeting without sending emails', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting({ dateTime: PAST, calendarEventId: 'evt-1' }));
        await syncMeetingToCalendar('athens', 'jun5_2026');
        expect(mockPatch).toHaveBeenCalledWith(
            expect.objectContaining({ eventId: 'evt-1', sendUpdates: 'none' }),
            expect.objectContaining({ timeout: expect.any(Number) }),
        );
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it('does not create events for past meetings even with allowCreate', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting({ dateTime: PAST }));
        await syncMeetingToCalendar('athens', 'jun5_2026', { allowCreate: true });
        expect(mockInsert).not.toHaveBeenCalled();
        expect(mockPatch).not.toHaveBeenCalled();
    });

    it('does nothing when there is no stored event ID and allowCreate is not set', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting());
        await syncMeetingToCalendar('athens', 'jun5_2026');
        expect(mockInsert).not.toHaveBeenCalled();
        expect(mockPatch).not.toHaveBeenCalled();
    });

    it('creates the event and stores its ID when allowCreate is set', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting());
        await syncMeetingToCalendar('athens', 'jun5_2026', { allowCreate: true });
        expect(mockInsert).toHaveBeenCalledWith(
            expect.objectContaining({
                calendarId: 'cal-123',
                sendUpdates: 'all',
            }),
            expect.objectContaining({ timeout: expect.any(Number) }),
        );
        expect(mockSetEventId).toHaveBeenCalledWith('athens', 'jun5_2026', 'evt-1');
    });

    it('patches the stored event instead of creating a new one', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting({ calendarEventId: 'evt-1' }));
        await syncMeetingToCalendar('athens', 'jun5_2026', { allowCreate: true });
        expect(mockPatch).toHaveBeenCalledWith(
            expect.objectContaining({
                calendarId: 'cal-123',
                eventId: 'evt-1',
                sendUpdates: 'all',
            }),
            expect.objectContaining({ timeout: expect.any(Number) }),
        );
        expect(mockInsert).not.toHaveBeenCalled();
        expect(mockSetEventId).not.toHaveBeenCalled();
    });

    it('builds the title from city and administrative body, and the description from agenda and meeting URL', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting({
            calendarEventId: 'evt-1',
            agendaUrl: 'https://example.com/agenda.pdf',
            administrativeBody: { name: 'Δημοτικό Συμβούλιο' },
        } as Partial<MeetingForCalendarSync>));
        await syncMeetingToCalendar('athens', 'jun5_2026');
        const body = mockPatch.mock.calls[0][0].requestBody;
        expect(body.summary).toBe('Αθήνα: Δημοτικό Συμβούλιο');
        expect(body.description).toBe('Ημερήσια Διάταξη: https://example.com/agenda.pdf\n\nhttps://opencouncil.gr/athens/jun5_2026');
        expect(body.visibility).toBe('public');
        expect(body.start.timeZone).toBe('Europe/Athens');
    });

    it('uses the city name alone when there is no administrative body', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting({ calendarEventId: 'evt-1' }));
        await syncMeetingToCalendar('athens', 'jun5_2026');
        const body = mockPatch.mock.calls[0][0].requestBody;
        expect(body.summary).toBe('Αθήνα');
        expect(body.description).toBe('https://opencouncil.gr/athens/jun5_2026');
    });

    it('invites the assigned operator as the only attendee', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting({
            calendarEventId: 'evt-1',
            meetingOperator: { user: { email: 'ops@opencouncil.gr' } },
        } as Partial<MeetingForCalendarSync>));
        await syncMeetingToCalendar('athens', 'jun5_2026');
        const body = mockPatch.mock.calls[0][0].requestBody;
        expect(body.attendees).toEqual([{ email: 'ops@opencouncil.gr' }]);
    });

    it('sends an empty attendee list when no operator is assigned', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting({ calendarEventId: 'evt-1' }));
        await syncMeetingToCalendar('athens', 'jun5_2026');
        expect(mockPatch.mock.calls[0][0].requestBody.attendees).toEqual([]);
    });

    it('keeps the operator off the guest list that readers of the public event see', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting({
            calendarEventId: 'evt-1',
            meetingOperator: { user: { email: 'ops@opencouncil.gr' } },
        } as Partial<MeetingForCalendarSync>));
        await syncMeetingToCalendar('athens', 'jun5_2026');
        expect(mockPatch.mock.calls[0][0].requestBody.guestsCanSeeOtherGuests).toBe(false);
    });

    it('deletes the event again when storing its ID fails, so no orphan is left', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting());
        mockSetEventId.mockRejectedValue(new Error('db down'));
        await syncMeetingToCalendar('athens', 'jun5_2026', { allowCreate: true });
        expect(mockDelete).toHaveBeenCalledWith(
            expect.objectContaining({ eventId: 'evt-1', sendUpdates: 'none' }),
            expect.objectContaining({ timeout: expect.any(Number) }),
        );
        expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('deleted again'),
        }));
    });

    it('reports the orphan for manual cleanup when the delete also fails', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting());
        mockSetEventId.mockRejectedValue(new Error('db down'));
        mockDelete.mockRejectedValue(new Error('calendar unreachable'));
        await syncMeetingToCalendar('athens', 'jun5_2026', { allowCreate: true });
        expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('an admin must delete it'),
        }));
        expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('evt-1'),
        }));
    });

    it('swallows Google API errors and alerts the admin channel', async () => {
        mockGetMeeting.mockResolvedValue(makeMeeting({ calendarEventId: 'evt-1' }));
        mockPatch.mockRejectedValue(new Error('boom'));
        await expect(syncMeetingToCalendar('athens', 'jun5_2026')).resolves.toBeUndefined();
        expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({
            status: 'failed',
            taskType: 'calendarSync',
            error: 'boom',
        }));
    });

    it('swallows database errors and alerts the admin channel', async () => {
        mockGetMeeting.mockRejectedValue(new Error('db down'));
        await expect(syncMeetingToCalendar('athens', 'jun5_2026')).resolves.toBeUndefined();
        expect(mockAlert).toHaveBeenCalled();
    });
});
