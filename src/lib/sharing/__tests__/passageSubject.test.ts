import { majoritySubject, nearestSubject, NEAREST_SUBJECT_WINDOW_S } from '@/lib/sharing/passageSubject';

const a = { id: 'a' }, b = { id: 'b' };

describe('majoritySubject', () => {
    it('picks the subject most utterances carry and ignores the unassigned ones', () => {
        expect(majoritySubject([a, null, b, a, undefined])).toBe(a);
    });
    it('is null when no utterance carries a subject', () => {
        expect(majoritySubject([null, undefined])).toBeNull();
        expect(majoritySubject([])).toBeNull();
    });
});

describe('nearestSubject', () => {
    it('takes the closer neighbour within the window', () => {
        expect(nearestSubject({ start: 100, end: 110 }, { at: 40, subject: a }, { at: 140, subject: b })).toBe(b);
        expect(nearestSubject({ start: 100, end: 110 }, { at: 90, subject: a }, { at: 140, subject: b })).toBe(a);
    });
    it('borrows nothing from a discussion outside the window', () => {
        expect(nearestSubject({ start: 100, end: 110 }, { at: 100 - NEAREST_SUBJECT_WINDOW_S - 1, subject: a }, null)).toBeNull();
        expect(nearestSubject({ start: 100, end: 110 }, null, { at: 110 + NEAREST_SUBJECT_WINDOW_S, subject: b })).toBe(b);
    });
});
