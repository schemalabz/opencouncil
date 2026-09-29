import { majoritySubject, nearestSubject, subjectOfPassage, NEAREST_SUBJECT_WINDOW_S } from '../passageSubject';

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

describe('subjectOfPassage', () => {
    const utterance = (id: string, startTimestamp: number, discussionSubjectId: string | null, drift = 0, discussionStatus: string | null = null) => ({ id, startTimestamp, discussionSubjectId, drift, discussionStatus });
    it('names the subject most selected utterances carry', () => {
        const utterances = [utterance('u1', 0, 'a'), utterance('u2', 5, 'b'), utterance('u3', 10, 'b')];
        expect(subjectOfPassage(utterances, new Set(['u2', 'u3']), [a, b])).toBe(b);
    });
    it('borrows the nearest assigned utterance for an unassigned passage, else the only subject', () => {
        const utterances = [utterance('u1', 0, 'a'), utterance('u2', 30, null), utterance('u3', 500, 'b')];
        expect(subjectOfPassage(utterances, new Set(['u2']), [a, b])).toBe(a);
        expect(subjectOfPassage([utterance('u2', 30, null)], new Set(['u2']), [b])).toBe(b);
        expect(subjectOfPassage([utterance('u2', 30, null)], new Set(['u2']), [a, b])).toBeNull();
    });
    it('follows the public resolver: no borrowing past the drift filter, and no subject for a roll call', () => {
        const utterances = [utterance('u1', 0, 'a', 100), utterance('u2', 30, null), utterance('u3', 90, 'b')];
        expect(subjectOfPassage(utterances, new Set(['u2']), [a, b], 50)).toBe(b);
        expect(subjectOfPassage([utterance('u1', 0, 'a'), utterance('u2', 30, null, 0, 'ATTENDANCE')], new Set(['u2']), [a])).toBeNull();
    });
});
