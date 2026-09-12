import { rankSubjectIdsForImages } from '../subjectImageBackfill';
import type { SubjectImageBackfillRow } from '@/lib/db/subject';

const row = (overrides: Partial<SubjectImageBackfillRow> & { id: string }): SubjectImageBackfillRow => ({
    cityId: 'athens',
    meetingDate: new Date('2026-08-01'),
    adminBodyType: 'council',
    discussionSeconds: 600,
    hasLocation: false,
    ...overrides,
});

describe('rankSubjectIdsForImages', () => {
    it('puts the recent, long-discussed council subject first', () => {
        const ids = rankSubjectIdsForImages([
            row({ id: 'old-short', meetingDate: new Date('2025-01-01'), discussionSeconds: 60 }),
            row({ id: 'hot', meetingDate: new Date('2026-08-30'), discussionSeconds: 5400 }),
            row({ id: 'committee', adminBodyType: 'committee' }),
        ]);
        expect(ids[0]).toBe('hot');
        expect(ids[ids.length - 1]).toBe('old-short');
    });

    it('lifts a small municipality over an equal subject from a big one', () => {
        const ids = rankSubjectIdsForImages([
            row({ id: 'athens-1' }),
            row({ id: 'athens-2' }),
            row({ id: 'athens-3' }),
            row({ id: 'sparta', cityId: 'sparta' }),
        ]);
        expect(ids[0]).toBe('sparta');
    });

    it('returns every id exactly once', () => {
        const rows = ['a', 'b', 'c'].map((id) => row({ id }));
        expect(rankSubjectIdsForImages(rows).sort()).toEqual(['a', 'b', 'c']);
    });
});
