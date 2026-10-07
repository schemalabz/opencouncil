/** @jest-environment jsdom */
import { clearDraft, draftKey, readDraft, stashPhoneForGoogleReturn, takePhoneFromGoogleReturn, writeDraft } from '../signup-draft';

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

describe('the phone a tab takes to Google', () => {
    it('comes back once, in this tab, and not from the draft', () => {
        const key = draftKey('petition', 'argos');
        stashPhoneForGoogleReturn(key, '+30 694 3472297');
        expect(takePhoneFromGoogleReturn(key)).toBe('+30 694 3472297');
        expect(takePhoneFromGoogleReturn(key)).toBeNull();
        expect(window.localStorage.length).toBe(0);
    });

    it('keeps nothing for an empty field', () => {
        const key = draftKey('petition', 'argos');
        stashPhoneForGoogleReturn(key, '  ');
        expect(takePhoneFromGoogleReturn(key)).toBeNull();
    });

    it('drops an earlier trip\'s number when the next trip starts with an empty field', () => {
        const key = draftKey('petition', 'argos');
        stashPhoneForGoogleReturn(key, '+30 694 3472297');
        stashPhoneForGoogleReturn(key, '');
        expect(takePhoneFromGoogleReturn(key)).toBeNull();
    });
});
