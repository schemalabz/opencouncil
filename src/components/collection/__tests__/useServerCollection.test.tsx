import { act, renderHook } from '@testing-library/react';
import { useServerCollection } from '../useServerCollection';
import { SEARCH_DEBOUNCE_MS } from '@/hooks/useQueryParamState';

let mockSearchParams = new URLSearchParams();
const push = jest.fn();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
    useSearchParams: () => mockSearchParams,
}));

jest.mock('@/i18n/routing', () => ({
    useRouter: () => ({ push, replace }),
    usePathname: () => '/chania/meetings',
}));

const filterOptions = [
    { value: 'council', label: 'Συμβούλιο' },
    { value: 'community', label: 'Κοινότητες' },
];
const bodies = [{ value: 'a', label: 'Κοινότητα Α' }];
const rows = [{ id: 'm1' }, { id: 'm2' }];

const render = (query = '') => {
    mockSearchParams = new URLSearchParams(query);
    return renderHook(() => useServerCollection({
        rows,
        total: 130,
        page: 2,
        pageSize: 12,
        filterOptions,
        defaultFilterValues: ['council'],
        bodyOptionsFor: type => (type === 'community' ? bodies : []),
    }));
};

beforeEach(() => {
    push.mockClear();
    replace.mockClear();
});

describe('useServerCollection', () => {
    it('draws the rows, the total and the page that the server sent', () => {
        const { result } = render('page=2');
        expect(result.current.rows).toBe(rows);
        expect(result.current.total).toBe(130);
        expect(result.current.page).toBe(2);
        expect(result.current.totalPages).toBe(11);
        expect(result.current.search).not.toBeNull();
    });

    it('reads the selection from the URL', () => {
        const { result } = render('filters=Κοινότητες&body=Κοινότητα Α&search=x');
        expect(result.current.selectedFilters).toEqual(['community']);
        expect(result.current.selectedBody).toBe('a');
        expect(result.current.search!.query).toBe('x');
    });

    it('pushes filter, body and page changes through the router, without scrolling', () => {
        const { result } = render('filters=Κοινότητες&page=2');
        act(() => result.current.setPage(3));
        expect(push).toHaveBeenLastCalledWith(`/chania/meetings?${new URLSearchParams({ filters: 'Κοινότητες', page: '3' })}`, { scroll: false });
        act(() => result.current.setBody('a'));
        expect(push).toHaveBeenLastCalledWith(`/chania/meetings?${new URLSearchParams({ filters: 'Κοινότητες', body: 'Κοινότητα Α' })}`, { scroll: false });
        act(() => result.current.setFilters(['council']));
        expect(push).toHaveBeenLastCalledWith('/chania/meetings', { scroll: false });
    });

    it('replaces the URL with the search after the debounce, and keeps the text local until then', () => {
        jest.useFakeTimers();
        const { result } = render('page=2');
        act(() => result.current.search!.setQuery('λογοδοσια'));
        expect(result.current.search!.query).toBe('λογοδοσια');
        expect(replace).not.toHaveBeenCalled();
        act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenCalledWith(`/chania/meetings?${new URLSearchParams({ search: 'λογοδοσια' })}`, { scroll: false });
        jest.useRealTimers();
    });

    it('builds a link for each page', () => {
        const { result } = render('filters=*');
        expect(result.current.hrefForPage(4)).toBe(`?${new URLSearchParams({ filters: '*', page: '4' })}`);
    });

    it('keeps the text typed while the search navigation was running', () => {
        jest.useFakeTimers();
        const { result, rerender } = render('');
        act(() => result.current.search!.setQuery('αγιου'));
        act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenLastCalledWith(`/chania/meetings?${new URLSearchParams({ search: 'αγιου' })}`, { scroll: false });

        // The reader keeps typing before the navigation lands.
        act(() => result.current.search!.setQuery('αγιου νικολαου'));

        // The navigation lands: the URL now holds the text that was sent.
        mockSearchParams = new URLSearchParams({ search: 'αγιου' });
        rerender();
        expect(result.current.search!.query).toBe('αγιου νικολαου');

        act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenLastCalledWith(`/chania/meetings?${new URLSearchParams({ search: 'αγιου νικολαου' })}`, { scroll: false });
        jest.useRealTimers();
    });

    it('still follows a URL change that it did not send, such as Back', () => {
        const { result, rerender } = render('search=πρωτο');
        mockSearchParams = new URLSearchParams({ search: 'δευτερο' });
        rerender();
        expect(result.current.search!.query).toBe('δευτερο');
    });

    it('keeps a search that is still loading when the reader then picks a filter', () => {
        jest.useFakeTimers();
        const { result } = render('');
        act(() => result.current.search!.setQuery('σχολ'));
        act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        // The search has not landed: the URL on screen has no `search` yet.
        act(() => result.current.setFilters(['community']));
        expect(push).toHaveBeenLastCalledWith(`/chania/meetings?${new URLSearchParams({ search: 'σχολ', filters: 'Κοινότητες' })}`, { scroll: false });
        jest.useRealTimers();
    });

    it('keeps a filter that is still loading when the reader then searches', () => {
        jest.useFakeTimers();
        const { result } = render('');
        act(() => result.current.setFilters(['community']));
        act(() => result.current.search!.setQuery('σχολ'));
        act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenLastCalledWith(`/chania/meetings?${new URLSearchParams({ filters: 'Κοινότητες', search: 'σχολ' })}`, { scroll: false });
        jest.useRealTimers();
    });

    it('leaves the search box alone while its own navigations land, one after the other', () => {
        jest.useFakeTimers();
        const { result, rerender } = render('');
        act(() => result.current.search!.setQuery('σχολ'));
        act(() => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        act(() => result.current.setFilters(['community']));
        act(() => result.current.search!.setQuery('σχολειο'));

        mockSearchParams = new URLSearchParams({ search: 'σχολ' });
        rerender();
        expect(result.current.search!.query).toBe('σχολειο');

        mockSearchParams = new URLSearchParams({ search: 'σχολ', filters: 'Κοινότητες' });
        rerender();
        expect(result.current.search!.query).toBe('σχολειο');
        jest.useRealTimers();
    });

    it('forgets a filter still loading when the reader returns to the view on screen', () => {
        const { result, rerender } = render('');
        act(() => result.current.setFilters(['community']));
        act(() => result.current.setFilters(['council']));
        expect(push).toHaveBeenLastCalledWith('/chania/meetings', { scroll: false });
        act(() => result.current.setFilters(['community']));
        mockSearchParams = new URLSearchParams({ filters: 'Κοινότητες' });
        rerender();

        // Back, to the URL of the abandoned return: a navigation this source
        // did not make, so the next change builds on the URL on screen.
        mockSearchParams = new URLSearchParams();
        rerender();
        act(() => result.current.setPage(3));
        expect(push).toHaveBeenLastCalledWith('/chania/meetings?page=3', { scroll: false });
    });

    it('matches the last copy of a URL asked for twice, so a later link is not taken for its own', () => {
        const { result, rerender } = render('page=2');
        act(() => result.current.setFilters(['community']));
        act(() => result.current.setFilters(['council']));
        act(() => result.current.setFilters(['community']));
        mockSearchParams = new URLSearchParams({ filters: 'Κοινότητες' });
        rerender();

        // A plain link to the tab, with no params.
        mockSearchParams = new URLSearchParams();
        rerender();
        act(() => result.current.setPage(2));
        expect(push).toHaveBeenLastCalledWith('/chania/meetings?page=2', { scroll: false });
    });

    it('starts again from the URL on screen after a navigation it did not make', () => {
        const { result, rerender } = render('');
        act(() => result.current.setFilters(['community']));
        // Back, to a page this source never asked for.
        mockSearchParams = new URLSearchParams({ page: '2' });
        rerender();
        act(() => result.current.setPage(3));
        expect(push).toHaveBeenLastCalledWith('/chania/meetings?page=3', { scroll: false });
    });
});
