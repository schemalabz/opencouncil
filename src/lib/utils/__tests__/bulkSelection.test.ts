import { bulkActionScope, headerCheckState, toggleAll } from '../bulkSelection';

const set = (...ids: string[]) => new Set(ids);

describe('bulkActionScope', () => {
    const visible = ['a', 'b', 'c', 'd'];
    const eligible = set('a', 'c', 'x');

    it('acts on every eligible row in view when nothing is ticked', () => {
        expect(bulkActionScope(set(), visible, eligible)).toEqual(['a', 'c']);
    });

    it('acts on the ticked rows only, still keeping just the eligible ones', () => {
        expect(bulkActionScope(set('b', 'c'), visible, eligible)).toEqual(['c']);
    });

    // Ticks survive a search, so a ticked row out of view still counts.
    it('keeps a ticked row the current view hides', () => {
        expect(bulkActionScope(set('x'), visible, eligible)).toEqual(['x']);
    });

    it('is empty when nothing in scope is eligible', () => {
        expect(bulkActionScope(set(), ['b', 'd'], eligible)).toEqual([]);
    });
});

describe('headerCheckState', () => {
    it('reads none, some and all', () => {
        expect(headerCheckState(['a', 'b'], set())).toBe(false);
        expect(headerCheckState(['a', 'b'], set('a'))).toBe('indeterminate');
        expect(headerCheckState(['a', 'b'], set('a', 'b', 'z'))).toBe(true);
    });

    it('is unticked over an empty list', () => {
        expect(headerCheckState([], set('a'))).toBe(false);
    });
});

describe('toggleAll', () => {
    it('ticks every row in view, keeping ticks outside it', () => {
        expect(toggleAll(['a', 'b'], set('z'))).toEqual(set('z', 'a', 'b'));
    });

    it('unticks the rows in view once all of them are ticked', () => {
        expect(toggleAll(['a', 'b'], set('a', 'b', 'z'))).toEqual(set('z'));
    });

    it('ticks the rest when only some are ticked', () => {
        expect(toggleAll(['a', 'b'], set('a'))).toEqual(set('a', 'b'));
    });
});
