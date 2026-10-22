import { act, renderHook } from '@testing-library/react';
import { createContext, Suspense, use, useState, type ReactNode } from 'react';
import { useServerCollection } from '../useServerCollection';
import { SEARCH_DEBOUNCE_MS } from '@/hooks/useQueryParamState';

// A fake App Router. As in Next, push and replace set the next URL in the
// caller's transition, and the render waits on the navigation: the URL on
// screen keeps its old value, and `pending` stays true, until the test lands
// it. A later navigation replaces an earlier one that has not landed.
type Navigation = { params: URLSearchParams; landed: Promise<void> };
const mockNavigation = createContext<URLSearchParams>(new URLSearchParams());
let setNavigation: (navigation: Navigation) => void = () => {};
let landLatest: () => Promise<void> = async () => {};

const landedAlready = (): Promise<void> =>
    Object.assign(Promise.resolve(), { status: 'fulfilled', value: undefined });

const push = jest.fn();
const replace = jest.fn();

function navigateTo(href: string) {
    let land!: () => void;
    const landed = new Promise<void>(resolve => { land = resolve; });
    landLatest = async () => { land(); await landed; };
    setNavigation({ params: new URLSearchParams(href.split('?')[1] ?? ''), landed });
}

jest.mock('next/navigation', () => ({
    useSearchParams: () => jest.requireActual('react').useContext(mockNavigation),
}));

// One router for every render, as in Next: a hook that closes over a stale
// value would otherwise be rebuilt on every render here and hide it.
const mockRouter = {
    push: (href: string, options: unknown) => { push(href, options); navigateTo(href); },
    replace: (href: string, options: unknown) => { replace(href, options); navigateTo(href); },
};

jest.mock('@/i18n/routing', () => ({
    useRouter: () => mockRouter,
    usePathname: () => '/chania/meetings',
}));

function FakeRouter({ initial, children }: { initial: string; children: ReactNode }) {
    const [navigation, set] = useState<Navigation>({ params: new URLSearchParams(initial), landed: landedAlready() });
    setNavigation = set;
    use(navigation.landed);
    return <mockNavigation.Provider value={navigation.params}>{children}</mockNavigation.Provider>;
}

/** The navigation lands: the URL on screen becomes the one last asked for. */
const land = () => act(async () => { await landLatest(); });

/** A navigation this source did not make: Back, Forward or a link. It replaces one still loading. */
const goTo = (query: string) => act(async () => { setNavigation({ params: new URLSearchParams(query), landed: landedAlready() }); });

const filterOptions = [
    { value: 'council', label: 'Συμβούλιο' },
    { value: 'community', label: 'Κοινότητες' },
];
const bodies = [{ value: 'a', label: 'Κοινότητα Α' }];
const rows = [{ id: 'm1' }, { id: 'm2' }];

const render = (query = '', page = 2) => renderHook(() => useServerCollection({
    rows,
    total: 130,
    page,
    pageSize: 12,
    filterOptions,
    defaultFilterValues: ['council'],
    bodyOptionsFor: type => (type === 'community' ? bodies : []),
}), {
    wrapper: ({ children }) => (
        <Suspense fallback={null}>
            <FakeRouter initial={query}>{children}</FakeRouter>
        </Suspense>
    ),
});

const url = (params: Record<string, string>) => `/chania/meetings?${new URLSearchParams(params)}`;

beforeEach(() => {
    push.mockClear();
    replace.mockClear();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('useServerCollection', () => {
    it('draws the rows, the total and the page that the server sent', async () => {
        const { result } = render('page=2');
        expect(result.current.rows).toBe(rows);
        expect(result.current.total).toBe(130);
        expect(result.current.page).toBe(2);
        expect(result.current.totalPages).toBe(11);
        expect(result.current.pending).toBe(false);
    });

    it('reads the selection from the URL', async () => {
        const { result } = render('filters=Κοινότητες&body=Κοινότητα Α&search=x');
        expect(result.current.selectedFilters).toEqual(['community']);
        expect(result.current.selectedBody).toBe('a');
        expect(result.current.search!.query).toBe('x');
    });

    it('pushes filter, body and page changes through the router, without scrolling', async () => {
        const { result } = render('filters=Κοινότητες&page=2');
        await act(async () => result.current.setPage(3));
        expect(push).toHaveBeenLastCalledWith(url({ filters: 'Κοινότητες', page: '3' }), { scroll: false });
        await land();
        await act(async () => result.current.setBody('a'));
        expect(push).toHaveBeenLastCalledWith(url({ filters: 'Κοινότητες', body: 'Κοινότητα Α' }), { scroll: false });
        await land();
        await act(async () => result.current.setFilters(['council']));
        expect(push).toHaveBeenLastCalledWith('/chania/meetings', { scroll: false });
    });

    it('replaces the URL with the search after the debounce, and keeps the text local until then', async () => {
        jest.useFakeTimers();
        const { result } = render('page=2');
        await act(async () => result.current.search!.setQuery('λογοδοσια'));
        expect(result.current.search!.query).toBe('λογοδοσια');
        expect(replace).not.toHaveBeenCalled();
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenCalledWith(url({ search: 'λογοδοσια' }), { scroll: false });
    });

    it('builds a link for each page', async () => {
        const { result } = render('filters=*');
        expect(result.current.hrefForPage(4)).toBe(`?${new URLSearchParams({ filters: '*', page: '4' })}`);
    });

    it('is pending, and shows what the reader picked, until the navigation lands', async () => {
        const { result } = render('');
        await act(async () => result.current.setFilters(['community']));
        expect(result.current.pending).toBe(true);
        expect(result.current.selectedFilters).toEqual(['community']);
        expect(result.current.hrefForPage(2)).toBe(`?${new URLSearchParams({ filters: 'Κοινότητες', page: '2' })}`);
        await land();
        expect(result.current.pending).toBe(false);
        expect(result.current.selectedFilters).toEqual(['community']);
    });

    it('counts a second Next from the page already asked for', async () => {
        const { result } = render('', 1);
        await act(async () => result.current.setPage(result.current.page + 1));
        await act(async () => result.current.setPage(result.current.page + 1));
        expect(push).toHaveBeenLastCalledWith(url({ page: '3' }), { scroll: false });
    });

    it('keeps the text typed while the search navigation was running', async () => {
        jest.useFakeTimers();
        const { result } = render('');
        await act(async () => result.current.search!.setQuery('αγιου'));
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenLastCalledWith(url({ search: 'αγιου' }), { scroll: false });

        // The reader keeps typing before the navigation lands.
        await act(async () => result.current.search!.setQuery('αγιου νικολαου'));
        await land();
        expect(result.current.search!.query).toBe('αγιου νικολαου');

        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenLastCalledWith(url({ search: 'αγιου νικολαου' }), { scroll: false });
    });

    it('still follows a URL change that it did not send, such as Back', async () => {
        const { result } = render('search=πρωτο');
        await goTo('search=δευτερο');
        expect(result.current.search!.query).toBe('δευτερο');
    });

    it('follows Back that arrives before the debounce, and drops the text typed', async () => {
        jest.useFakeTimers();
        const { result } = render('filters=*&page=2');
        await act(async () => result.current.search!.setQuery('προϋπ'));
        // Back, to page 1, which carries the same (empty) search as page 2.
        await goTo('filters=*');
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
        expect(result.current.search!.query).toBe('');
        expect(replace).not.toHaveBeenCalled();
    });

    it('keeps the search of an entry that Forward restores while the box was being cleared', async () => {
        jest.useFakeTimers();
        const { result } = render('search=ab');
        await act(async () => result.current.search!.setQuery(''));
        await goTo('search=ab&filters=Κοινότητες');
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
        expect(result.current.search!.query).toBe('ab');
        expect(replace).not.toHaveBeenCalled();
    });

    it('keeps a search that is still loading when the reader then picks a filter', async () => {
        jest.useFakeTimers();
        const { result } = render('');
        await act(async () => result.current.search!.setQuery('σχολ'));
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        // The search has not landed: the URL on screen has no `search` yet.
        await act(async () => result.current.setFilters(['community']));
        expect(push).toHaveBeenLastCalledWith(url({ search: 'σχολ', filters: 'Κοινότητες' }), { scroll: false });
    });

    it('takes the text typed before the debounce along with a filter, so Back returns to the pick', async () => {
        jest.useFakeTimers();
        const { result } = render('');
        await act(async () => result.current.search!.setQuery('σχολ'));
        await act(async () => result.current.setFilters(['community']));
        expect(push).toHaveBeenLastCalledWith(url({ search: 'σχολ', filters: 'Κοινότητες' }), { scroll: false });
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).not.toHaveBeenCalled();
    });

    it('takes the text typed before the debounce along with a body', async () => {
        jest.useFakeTimers();
        const { result } = render('filters=Κοινότητες');
        await act(async () => result.current.search!.setQuery('σχολ'));
        await act(async () => result.current.setBody('a'));
        expect(push).toHaveBeenLastCalledWith(url({ filters: 'Κοινότητες', search: 'σχολ', body: 'Κοινότητα Α' }), { scroll: false });
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).not.toHaveBeenCalled();
    });

    it('keeps a filter that is still loading when the reader then searches', async () => {
        jest.useFakeTimers();
        const { result } = render('');
        await act(async () => result.current.setFilters(['community']));
        await act(async () => result.current.search!.setQuery('σχολ'));
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenLastCalledWith(url({ filters: 'Κοινότητες', search: 'σχολ' }), { scroll: false });
    });

    it('leaves the search box alone when its own navigation lands while the reader types', async () => {
        jest.useFakeTimers();
        const { result } = render('');
        await act(async () => result.current.search!.setQuery('σχολ'));
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        await act(async () => result.current.setFilters(['community']));
        await act(async () => result.current.search!.setQuery('σχολειο'));
        await land();
        expect(result.current.search!.query).toBe('σχολειο');
        expect(result.current.selectedFilters).toEqual(['community']);
    });

    it('builds on the URL on screen once the reader returns to it', async () => {
        const { result } = render('');
        await act(async () => result.current.setFilters(['community']));
        await act(async () => result.current.setFilters(['council']));
        expect(push).toHaveBeenLastCalledWith('/chania/meetings', { scroll: false });
        await land();
        await act(async () => result.current.setPage(3));
        expect(push).toHaveBeenLastCalledWith(url({ page: '3' }), { scroll: false });
    });

    it('starts again from the URL on screen after a navigation it did not make', async () => {
        const { result } = render('');
        await act(async () => result.current.setFilters(['community']));
        // Back, to a page this source never asked for, while the filter loads.
        await goTo('page=2');
        expect(result.current.pending).toBe(false);
        expect(result.current.selectedFilters).toEqual(['council']);
        await act(async () => result.current.setPage(3));
        expect(push).toHaveBeenLastCalledWith(url({ page: '3' }), { scroll: false });
    });

    it('follows a plain link after the reader went back and forth between filters', async () => {
        const { result } = render('page=2');
        await act(async () => result.current.setFilters(['community']));
        await act(async () => result.current.setFilters(['council']));
        await act(async () => result.current.setFilters(['community']));
        await land();

        // A plain link to the tab, with no params.
        await goTo('');
        await act(async () => result.current.setPage(2));
        expect(push).toHaveBeenLastCalledWith(url({ page: '2' }), { scroll: false });
    });

    it('shows the page that the server clamped to, not the page in the URL', async () => {
        // ?page=99 on a list of 11 pages: the server loaded page 11.
        const { result } = render('page=99', 11);
        expect(result.current.page).toBe(11);
    });

    it('does not navigate when the reader asks for the URL already shown', async () => {
        const { result } = render('page=2');
        await act(async () => result.current.setPage(2));
        expect(push).not.toHaveBeenCalled();
        expect(result.current.pending).toBe(false);
    });

    it('sends one navigation for a burst of typing', async () => {
        jest.useFakeTimers();
        const { result } = render('');
        for (const text of ['σ', 'σχ', 'σχο', 'σχολ']) {
            await act(async () => result.current.search!.setQuery(text));
            await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1); });
        }
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        expect(replace).toHaveBeenCalledTimes(1);
        expect(replace).toHaveBeenCalledWith(url({ search: 'σχολ' }), { scroll: false });
    });

    it('pages within a filter that is still loading', async () => {
        const { result } = render('');
        await act(async () => result.current.setFilters(['community']));
        await act(async () => result.current.setPage(2));
        expect(push).toHaveBeenLastCalledWith(url({ filters: 'Κοινότητες', page: '2' }), { scroll: false });
    });

    it('follows Forward back to the URL it sent itself, after a Back', async () => {
        jest.useFakeTimers();
        const { result } = render('');
        await act(async () => result.current.search!.setQuery('πρωτο'));
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        await land();
        // Back to an entry with another search, then Forward to the one this source sent.
        await goTo('search=αλλο');
        expect(result.current.search!.query).toBe('αλλο');
        await goTo('search=πρωτο');
        expect(result.current.search!.query).toBe('πρωτο');
        replace.mockClear();
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
        expect(replace).not.toHaveBeenCalled();
    });

    it('keeps a page picked while its own search is still loading', async () => {
        jest.useFakeTimers();
        const { result } = render('', 1);
        await act(async () => result.current.search!.setQuery('σχολ'));
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS); });
        // The search has not landed; the reader turns to page 2 of its results.
        await act(async () => result.current.setPage(2));
        expect(push).toHaveBeenLastCalledWith(url({ search: 'σχολ', page: '2' }), { scroll: false });
        await act(async () => { jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2); });
        expect(replace).toHaveBeenCalledTimes(1);
    });
});
