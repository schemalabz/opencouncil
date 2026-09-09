// buildApiSubjectWhere is a pure filter builder; mock the prisma singleton so
// importing subjectsApi.ts doesn't pull in the real client (→ env.mjs, which
// the jest transform doesn't handle).
jest.mock('../prisma', () => ({ __esModule: true, default: {} }));

import { Realm } from '@prisma/client';
import { buildApiSubjectWhere } from '@/lib/db/subjectsApi';
import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';

describe('buildApiSubjectWhere', () => {
    describe('the public view', () => {
        it('serves released meetings of a published city in the realm of the request', () => {
            const where = buildApiSubjectWhere(Realm.greece, 'athens', {});

            expect(where).toEqual({
                cityId: 'athens',
                councilMeeting: {
                    released: true,
                    city: { ...PUBLIC_CITY_WHERE, realm: Realm.greece },
                },
            });
        });

        it('excludes a city that is not published', () => {
            // A city ID is public: /api/cities/all lists pending cities too. The
            // status constraint is what keeps their meetings out of the API.
            const { councilMeeting } = buildApiSubjectWhere(Realm.greece, 'pending-city', {});

            expect(councilMeeting).toMatchObject({ city: { status: { in: ['demo', 'supported'] } } });
        });

        it('scopes to the realm of the request', () => {
            const { councilMeeting } = buildApiSubjectWhere(Realm.france, 'paris', {});

            expect(councilMeeting).toMatchObject({ city: { realm: Realm.france } });
        });
    });

    describe('the authorized view', () => {
        it('drops the release, status and realm constraints', () => {
            // The routes authorize for the city before they pass this, so an
            // admin of a city we do not publish still reads their own city.
            const where = buildApiSubjectWhere(Realm.greece, 'athens', { includeUnreleased: true });

            expect(where).toEqual({ cityId: 'athens' });
        });

        it('keeps a date range while it drops the visibility constraints', () => {
            const to = new Date('2025-12-31T23:59:59.999Z');
            const where = buildApiSubjectWhere(Realm.greece, 'athens', { includeUnreleased: true, to });

            expect(where.councilMeeting).toEqual({ dateTime: { lte: to } });
        });
    });

    describe('filters', () => {
        it('restricts to one meeting', () => {
            expect(buildApiSubjectWhere(Realm.greece, 'athens', { meetingId: 'm1' }))
                .toMatchObject({ councilMeetingId: 'm1' });
        });

        it('restricts to one introducer', () => {
            expect(buildApiSubjectWhere(Realm.greece, 'athens', { introducerId: 'p1' }))
                .toMatchObject({ personId: 'p1' });
        });

        it('applies each end of the date range', () => {
            const from = new Date('2025-01-01T00:00:00.000Z');
            const to = new Date('2025-12-31T23:59:59.999Z');
            const { councilMeeting } = buildApiSubjectWhere(Realm.greece, 'athens', { from, to });

            expect(councilMeeting).toMatchObject({ dateTime: { gte: from, lte: to } });
        });

        it('omits the date filter when the caller names no range', () => {
            const { councilMeeting } = buildApiSubjectWhere(Realm.greece, 'athens', {});

            expect(councilMeeting).not.toHaveProperty('dateTime');
        });
    });
});
