import { act, renderHook } from '@testing-library/react';
import { useLocalCollection, type LocalCollectionOptions } from '../useLocalCollection';
import { SEARCH_DEBOUNCE_MS } from '../types';

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
    useSearchParams: () => mockSearchParams,
}));

type Item = { id: string; name: string; body?: string; type?: string; former?: boolean };

const items: Item[] = Array.from({ length: 30 }, (_, i) => ({
    id: `m${i}`,
    name: `Συνεδρίαση ${i}`,
    type: i % 2 === 0 ? 'council' : 'community',
    body: i % 2 === 0 ? undefined : (i % 4 === 1 ? 'a' : 'b'),
    former: i === 29,
}));

const filterOptions = [
    { value: 'council', label: 'Συμβούλιο' },
    { value: 'community', label: 'Κοινότητες' },
];
const bodies = [{ value: 'a', label: 'Κοινότητα Α' }, { value: 'b', label: 'Κοινότητα Β' }];

const options: LocalCollectionOptions<Item, string> = {
    filterOptions,
    unsetMeansEveryValue: false,
    bodyOptionsFor: type => (type === 'community' ? bodies : []),
    filter: (selected, item, body) => (selected.length === 0 || selected.includes(item.type ?? '')) && (!body || item.body === body),
    searchKeys: item => [item.name],
    pageSize: 12,
};

const render = (query = '', overrides: Partial<LocalCollectionOptions<Item, string>> = {}) => {
    mockSearchParams = new URLSearchParams(query);
    return renderHook(() => useLocalCollection(items, { ...options, ...overrides }));
};

beforeEach(() => {
    jest.restoreAllMocks();
});

describe('useLocalCollection', () => {
    it('pages the items and reports the total and the page count', () => {
        const { result } = render();
        expect(result.current.total).toBe(30);
        expect(result.current.totalPages).toBe(3);
        expect(result.current.rows.map(r => r.id)).toEqual(items.slice(0, 12).map(i => i.id));
        expect(result.current.pending).toBe(false);
    });

    it('reads the page from the URL and clamps it to the last page', () => {
        expect(render('page=2').result.current.rows[0].id).toBe('m12');
        expect(render('page=9').result.current.page).toBe(3);
    });

    it('filters by the selected type and the selected body', () => {
        expect(render('filters=Κοινότητες').result.current.total).toBe(15);
        const { result } = render('filters=Κοινότητες&body=Κοινότητα Α');
        expect(result.current.selectedBody).toBe('a');
        expect(result.current.rows.every(r => r.body === 'a')).toBe(true);
    });

    it('searches immediately, ignoring accents, and goes back to page 1 while the URL waits', () => {
        const { result } = render('page=2');
        act(() => result.current.setQuery('συνεδριαση 2'));
        expect(result.current.page).toBe(1);
        // «2» also matches «Συνεδρίαση 12»: twelve rows, one page.
        expect(result.current.rows.map(r => r.id)).toEqual(['m2', 'm12', 'm20', 'm21', 'm22', 'm23', 'm24', 'm25', 'm26', 'm27', 'm28', 'm29']);
    });

    it('writes the search to the URL with replaceState after the debounce', () => {
        jest.useFakeTimers();
        const replace = jest.spyOn(window.history, 'replaceState');
        const { result } = render('page=2');
        act(() => result.current.setQuery('x'));
        expect(replace).not.toHaveBeenCalled();
        act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenCalledWith(null, '', '?search=x');
        jest.useRealTimers();
    });

    it('applies no search when the source is not searchable', () => {
        const { result } = render('search=Συνεδρίαση 2', { searchable: false });
        expect(result.current.searchable).toBe(false);
        expect(result.current.total).toBe(30);
    });

    it('splits off the trailing rows but counts them in the total', () => {
        const { result } = render('page=3', { trailing: item => item.former === true });
        expect(result.current.total).toBe(30);
        expect(result.current.trailingRows.map(r => r.id)).toEqual(['m29']);
        expect(result.current.rows.map(r => r.id)).not.toContain('m29');
    });

    it('hands sortItems the matching rows, the selection and the body', () => {
        const sortItems = jest.fn((rows: Item[], _selected: string[], _body: string | null) => [...rows].reverse());
        const { result } = render('filters=Κοινότητες&body=Κοινότητα Β', { sortItems });
        const [rows, selected, body] = sortItems.mock.calls[sortItems.mock.calls.length - 1];
        expect(rows.every(r => r.body === 'b')).toBe(true);
        expect(selected).toEqual(['community']);
        expect(body).toBe('b');
        expect(result.current.rows[0].id).toBe(rows[rows.length - 1].id);
    });

    it('writes filter, body and page changes with pushState', () => {
        const push = jest.spyOn(window.history, 'pushState');
        const { result } = render('filters=Κοινότητες&page=2');
        act(() => result.current.setPage(3));
        expect(push).toHaveBeenLastCalledWith(null, '', `?${new URLSearchParams({ filters: 'Κοινότητες', page: '3' })}`);
        act(() => result.current.setBody('b'));
        expect(push).toHaveBeenLastCalledWith(null, '', `?${new URLSearchParams({ filters: 'Κοινότητες', body: 'Κοινότητα Β' })}`);
        act(() => result.current.setFilters([]));
        expect(push).toHaveBeenLastCalledWith(null, '', '?');
    });

    it('builds a link for each page', () => {
        expect(render('filters=Κοινότητες').result.current.hrefForPage(2)).toBe(`?${new URLSearchParams({ filters: 'Κοινότητες', page: '2' })}`);
        expect(render('page=2').result.current.hrefForPage(1)).toBe('?');
    });
});
