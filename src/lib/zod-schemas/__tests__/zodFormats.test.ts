/** @jest-environment node */
// Pins what the string formats, object strictness and value normalisation of
// the shared schemas accept, so a change of zod API spelling cannot move it.
import { roleDateSchema } from '@/lib/zod-schemas/role';
import { searchRequestSchema } from '@/lib/zod-schemas/search';
import { createAdminUserSchema } from '@/lib/zod-schemas/user';
import { saveNotificationPreferencesSchema } from '@/lib/zod-schemas/onboarding';
import { meetingSchema } from '@/lib/zod-schemas/meeting';
import { decisionConventionsSchema } from '@/lib/decisionConventions';

describe('roleDateSchema', () => {
    it.each(['2024-01-01', '2024-01-01T10:00:00Z', '2024-01-01T10:00:00+03:00', '2024-01-01T10:00:00.123+03:00'])('accepts %s', value => {
        expect(roleDateSchema.safeParse(value).success).toBe(true);
    });

    it.each(['2024-01-01T10:00:00', '2024-01-01T10:00+03:00', '2024-13-01', '01/02/2024'])('refuses %s', value => {
        expect(roleDateSchema.safeParse(value).success).toBe(false);
    });
});

describe('searchRequestSchema', () => {
    const dateRange = (start: string, end: string) => searchRequestSchema.safeParse({ query: 'x', dateRange: { start, end } }).success;

    it('takes a UTC date range and refuses one with an offset', () => {
        expect(dateRange('2024-01-01T00:00:00Z', '2024-02-01T00:00:00.000Z')).toBe(true);
        expect(dateRange('2024-01-01T00:00:00+02:00', '2024-02-01T00:00:00Z')).toBe(false);
        expect(dateRange('2024-01-01', '2024-02-01T00:00:00Z')).toBe(false);
    });

    it('refuses an unknown key at every level', () => {
        expect(searchRequestSchema.safeParse({ query: 'x', adminBodyTypes: [] }).success).toBe(false);
        expect(searchRequestSchema.safeParse({ query: 'x', dateRange: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T00:00:00Z', tz: 'x' } }).success).toBe(false);
        expect(searchRequestSchema.safeParse({ query: 'x', location: { point: { lat: 1, lon: 2 } } }).success).toBe(false);
    });
});

describe('createAdminUserSchema email', () => {
    it('trims and lower-cases before it checks the address', () => {
        const parsed = createAdminUserSchema.safeParse({ email: '  Foo@Example.COM ', name: null, isSuperAdmin: false });
        expect(parsed.success && parsed.data.email).toBe('foo@example.com');
    });

    it('refuses a value that is not an address, with its message', () => {
        const parsed = createAdminUserSchema.safeParse({ email: 'nope', name: null, isSuperAdmin: false });
        expect(parsed.error?.issues).toEqual([expect.objectContaining({ path: ['email'], message: 'Invalid email address' })]);
    });
});

describe('saveNotificationPreferencesSchema', () => {
    it('carries seedUser through unvalidated, for sanitizeSeedUser to read', () => {
        const parsed = saveNotificationPreferencesSchema.safeParse({ cityId: 'c', locations: [], topicIds: [], seedUser: { isSuperAdmin: true } });
        expect(parsed.success && parsed.data).toMatchObject({ seedUser: { isSuperAdmin: true } });
    });
});

describe('meetingSchema links', () => {
    const base = { name: 'Meeting', name_en: 'Meeting', date: '2024-01-01T10:00:00Z', meetingId: 'm1' };

    it('takes an empty link and refuses a non-URL with its message', () => {
        expect(meetingSchema.safeParse({ ...base, youtubeUrl: '', agendaUrl: '' }).success).toBe(true);
        expect(meetingSchema.safeParse({ ...base, youtubeUrl: 'not a url' }).error?.issues)
            .toEqual([expect.objectContaining({ path: ['youtubeUrl'], message: 'Invalid YouTube URL.' })]);
    });
});

describe('decisionConventionsSchema anchors', () => {
    const record = {
        version: 1, rollCallLayout: 'mixed', presentListMeaning: 'opening', statesPerDecisionAttendance: false,
        statesPerVoteAbsence: false, usesSubstitutes: false, namedVoters: 'all', mayorStatedSeparately: false,
        provenance: { source: 'profile' },
    };

    it('drops a name outside the vocabulary', () => {
        const parsed = decisionConventionsSchema.safeParse({ ...record, attendanceChangeAnchors: ['bogus', 'phase'] });
        expect(parsed.success && parsed.data.attendanceChangeAnchors).toEqual(['phase']);
    });

    it.each([[['phase', 3]], ['phase'], [undefined]])('refuses %p', anchors => {
        expect(decisionConventionsSchema.safeParse({ ...record, attendanceChangeAnchors: anchors }).success).toBe(false);
    });
});
