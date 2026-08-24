/** @jest-environment jsdom */
import { loadDraft, saveDraft, clearDraft, DRAFT_STORAGE_KEY } from './draftStorage';

describe('product update draft storage', () => {
    beforeEach(() => window.localStorage.clear());

    it('returns null when no draft is stored', () => {
        expect(loadDraft()).toBeNull();
    });

    it('round-trips a saved draft', () => {
        saveDraft({ subject: 'Hi', body: '# Body', tags: ['a', 'b'] });
        expect(loadDraft()).toEqual({ subject: 'Hi', body: '# Body', tags: ['a', 'b'] });
    });

    it('clears a stored draft', () => {
        saveDraft({ subject: 'Hi', body: 'b', tags: [] });
        clearDraft();
        expect(loadDraft()).toBeNull();
    });

    it('returns null for a malformed stored value', () => {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, '{"subject":123}');
        expect(loadDraft()).toBeNull();
    });

    it('drops non-string tags rather than failing', () => {
        window.localStorage.setItem(
            DRAFT_STORAGE_KEY,
            JSON.stringify({ subject: 's', body: 'b', tags: ['ok', 5, null] }),
        );
        expect(loadDraft()).toEqual({ subject: 's', body: 'b', tags: ['ok'] });
    });
});
