/** @jest-environment jsdom */
import { clearDraft, draftKey, readDraft, writeDraft } from '../signup-draft';

const KEY = draftKey('notifications', 'athens');

beforeEach(() => window.localStorage.clear());

describe('the signup draft', () => {
    it('gives back what it kept, under a key of its own per flow and municipality', () => {
        writeDraft(KEY, { topics: ['t1'], name: 'Μαρία' });
        expect(readDraft(KEY)).toEqual({ topics: ['t1'], name: 'Μαρία' });
        expect(readDraft(draftKey('petition', 'athens'))).toBeNull();
        expect(readDraft(draftKey('notifications', 'chania'))).toBeNull();
    });

    it('forgets a draft older than a day, so a stale form never comes back', () => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
        jest.setSystemTime(new Date('2026-09-17T10:00:00Z'));
        writeDraft(KEY, { name: 'Μαρία' });

        jest.setSystemTime(new Date('2026-09-18T09:59:00Z'));
        expect(readDraft(KEY)).toEqual({ name: 'Μαρία' });

        jest.setSystemTime(new Date('2026-09-18T10:01:00Z'));
        expect(readDraft(KEY)).toBeNull();
        jest.useRealTimers();
    });

    it('rejects an entry it cannot read rather than throwing at the reader', () => {
        window.localStorage.setItem(KEY, 'not json');
        expect(readDraft(KEY)).toBeNull();
        window.localStorage.setItem(KEY, JSON.stringify({ version: 99, at: Date.now(), value: { name: 'x' } }));
        expect(readDraft(KEY)).toBeNull();
    });

    it('clears', () => {
        writeDraft(KEY, { name: 'Μαρία' });
        clearDraft(KEY);
        expect(readDraft(KEY)).toBeNull();
    });
});
