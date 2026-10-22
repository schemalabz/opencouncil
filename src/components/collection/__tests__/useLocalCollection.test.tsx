import { act, renderHook } from '@testing-library/react';
import { useLocalCollection, type LocalCollectionOptions } from '../useLocalCollection';
import { SEARCH_DEBOUNCE_MS } from '@/hooks/useQueryParamState';

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
    useSearchParams: () => mockSearchParams,
}));

type Item = { id: string; name: string; body?: string; type?: string };

const items: Item[] = Array.from({ length: 30 }, (_, i) => ({
    id: `m${i}`,
    name: `Συνεδρίαση ${i}`,
    type: i % 2 === 0 ? 'council' : 'community',
    body: i % 2 === 0 ? undefined : (i % 4 === 1 ? 'a' : 'b'),
}));

const filterOptions = [
    { value: 'council', label: 'Συμβούλιο' },
    { value: 'community', label: 'Κοινότητες' },
];
const bodies = [{ value: 'a', label: 'Κοινότητα Α' }, { value: 'b', label: 'Κοινότητα Β' }];

const options: LocalCollectionOptions<Item, string> = {
    filterOptions,
    bodyOptionsFor: type => (type === 'community' ? bodies : []),
    filter: (selected, item, body) => (selected.length === 0 || selected.includes(item.type ?? '')) && (!body || item.body === body),
    searchKeys: item => [item.name],
};

const render = (query = '', overrides: Partial<LocalCollectionOptions<Item, string>> = {}) => {
    mockSearchParams = new URLSearchParams(query);
    return renderHook(() => useLocalCollection(items, { ...options, ...overrides }));
};

beforeEach(() => {
    jest.restoreAllMocks();
});

describe('useLocalCollection', () => {
    it('shows every matching row on one page, and is never pending', () => {
        const { result } = render('page=2');
        expect(result.current.total).toBe(30);
        expect(result.current.rows).toHaveLength(30);
        expect([result.current.page, result.current.totalPages]).toEqual([1, 1]);
        expect(result.current.pending).toBe(false);
    });

    it('filters by the selected type and the selected body', () => {
        expect(render('filters=Κοινότητες').result.current.total).toBe(15);
        const { result } = render('filters=Κοινότητες&body=Κοινότητα Α');
        expect(result.current.selectedBody).toBe('a');
        expect(result.current.rows.every(r => r.body === 'a')).toBe(true);
    });

    it('searches immediately, ignoring accents, while the URL waits', () => {
        const { result } = render();
        act(() => result.current.search!.setQuery('συνεδριαση 2'));
        // «2» also matches «Συνεδρίαση 12» and «Συνεδρίαση 20»–«29».
        expect(result.current.rows.map(r => r.id)).toEqual(['m2', 'm12', 'm20', 'm21', 'm22', 'm23', 'm24', 'm25', 'm26', 'm27', 'm28', 'm29']);
    });

    it('writes the search to the URL with replaceState after the debounce', () => {
        jest.useFakeTimers();
        const replace = jest.spyOn(window.history, 'replaceState');
        const { result } = render('page=2');
        act(() => result.current.search!.setQuery('x'));
        expect(replace).not.toHaveBeenCalled();
        act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenCalledWith(null, '', '?search=x');
        jest.useRealTimers();
    });

    it('keeps filtering when the browser refuses the history write', () => {
        jest.useFakeTimers();
        jest.spyOn(window.history, 'replaceState').mockImplementation(() => { throw new Error('SecurityError'); });
        const { result } = render();
        act(() => result.current.search!.setQuery('συνεδριαση 3'));
        expect(() => act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); })).not.toThrow();
        expect(result.current.rows.map(r => r.id)).toEqual(['m3', 'm13', 'm23']);
        jest.useRealTimers();
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

    it('follows the search of an entry that Back or Forward restores', () => {
        const { result, rerender } = render('search=πρωτο');
        expect(result.current.search!.query).toBe('πρωτο');
        mockSearchParams = new URLSearchParams('search=δευτερο');
        rerender();
        expect(result.current.search!.query).toBe('δευτερο');
    });

    it('leaves the URL alone when the search did not change', () => {
        jest.useFakeTimers();
        const replace = jest.spyOn(window.history, 'replaceState');
        render('search=x&page=2');
        act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
        expect(replace).not.toHaveBeenCalled();
        jest.useRealTimers();
    });

    it('writes an explicit "all" when the list has a default selection', () => {
        const push = jest.spyOn(window.history, 'pushState');
        const { result } = render('', { defaultFilterValues: ['council'] });
        act(() => result.current.setFilters([]));
        expect(push).toHaveBeenLastCalledWith(null, '', '?filters=*');
    });
});
