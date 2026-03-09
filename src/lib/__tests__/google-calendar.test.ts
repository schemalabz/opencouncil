import { buildMeetingCalendarParams, calculateMeetingEndTime } from '../google-calendar';

// Mock the env module to avoid validation errors in tests
jest.mock('@/env.mjs', () => ({
    env: {
        GOOGLE_CALENDAR_ENABLED: 'false',
        GOOGLE_CALENDAR_ID: undefined,
        GOOGLE_CALENDAR_CLIENT_ID: undefined,
        GOOGLE_CALENDAR_CLIENT_SECRET: undefined,
        GOOGLE_CALENDAR_REFRESH_TOKEN: undefined,
    },
}));

describe('calculateMeetingEndTime', () => {
    it('adds 2 hours by default', () => {
        const start = new Date('2026-03-10T10:00:00Z');
        const end = calculateMeetingEndTime(start);
        expect(end.getTime() - start.getTime()).toBe(2 * 60 * 60 * 1000);
    });

    it('adds custom duration in hours', () => {
        const start = new Date('2026-03-10T10:00:00Z');
        const end = calculateMeetingEndTime(start, 3);
        expect(end.getTime() - start.getTime()).toBe(3 * 60 * 60 * 1000);
    });

    it('does not mutate the original date', () => {
        const start = new Date('2026-03-10T10:00:00Z');
        const originalTime = start.getTime();
        calculateMeetingEndTime(start);
        expect(start.getTime()).toBe(originalTime);
    });
});

describe('buildMeetingCalendarParams', () => {
    const baseInput = {
        cityName: 'TestCity',
        administrativeBodyName: null as string | null | undefined,
        agendaUrl: null as string | null | undefined,
        meetingUrl: 'https://opencouncil.gr/chania/mar10_2026',
        startTime: new Date('2026-03-10T10:00:00Z'),
        timezone: 'Europe/Athens',
    };

    it('uses city name as title when no administrative body', () => {
        const result = buildMeetingCalendarParams(baseInput);
        expect(result.title).toBe('TestCity');
    });

    it('appends administrative body name to title', () => {
        const result = buildMeetingCalendarParams({
            ...baseInput,
            administrativeBodyName: 'Council',
        });
        expect(result.title).toBe('TestCity: Council');
    });

    it('includes agenda URL in description when provided', () => {
        const result = buildMeetingCalendarParams({
            ...baseInput,
            agendaUrl: 'https://example.com/agenda.pdf',
        });
        expect(result.description).toContain('https://example.com/agenda.pdf');
        expect(result.description).toContain(baseInput.meetingUrl);
    });

    it('includes only meeting URL in description when no agenda', () => {
        const result = buildMeetingCalendarParams(baseInput);
        expect(result.description).toBe(baseInput.meetingUrl);
    });

    it('calculates end time as 2 hours after start', () => {
        const result = buildMeetingCalendarParams(baseInput);
        expect(result.endTime.getTime() - result.startTime.getTime()).toBe(2 * 60 * 60 * 1000);
    });

    it('passes through timezone', () => {
        const result = buildMeetingCalendarParams(baseInput);
        expect(result.timezone).toBe('Europe/Athens');
    });
});
