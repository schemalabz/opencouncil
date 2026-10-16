import { unreleasedMeetingWhere, unreleasedCacheKey, NO_UNRELEASED, ALL_UNRELEASED } from '@/lib/unreleased';

describe('unreleasedMeetingWhere', () => {
    it('opens the drafts of the held bodies only, on top of the released meetings', () => {
        expect(unreleasedMeetingWhere(ALL_UNRELEASED)).toEqual({});
        expect(unreleasedMeetingWhere(NO_UNRELEASED)).toEqual({ released: true });
        expect(unreleasedMeetingWhere({ all: false, bodyIds: ['youth'] }))
            .toEqual({ OR: [{ released: true }, { administrativeBodyId: { in: ['youth'] } }] });
    });
});

describe('unreleasedCacheKey', () => {
    it('gives every distinct scope its own key, and one key per set of bodies', () => {
        const scopes = [ALL_UNRELEASED, NO_UNRELEASED, { all: false as const, bodyIds: ['youth'] },
            { all: false as const, bodyIds: ['culture'] }, { all: false as const, bodyIds: ['youth', 'culture'] }];
        expect(new Set(scopes.map(unreleasedCacheKey)).size).toBe(scopes.length);
        expect(unreleasedCacheKey({ all: false, bodyIds: ['youth', 'culture'] }))
            .toBe(unreleasedCacheKey({ all: false, bodyIds: ['culture', 'youth'] }));
    });
});
