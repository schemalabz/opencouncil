import { act, renderHook } from '@testing-library/react';
import { useServerCollection } from '../useServerCollection';

// The router mock below is synchronous, so a real transition would never be
// pending. This stands in for a navigation that has not landed yet.
let mockPending = false;
jest.mock('react', () => ({
    ...jest.requireActual('react'),
    useTransition: () => [mockPending, (fn: () => void) => fn()],
}));

// One object for every render, as Next returns: a new one each time would
// look like an outside navigation to the source.
const mockSearchParams = new URLSearchParams();
const push = jest.fn();
jest.mock('next/navigation', () => ({ useSearchParams: () => mockSearchParams }));
jest.mock('@/i18n/routing', () => ({
    useRouter: () => ({ push, replace: jest.fn() }),
    usePathname: () => '/chania/meetings',
}));

const filterOptions = [
    { value: 'council', label: 'Συμβούλιο' },
    { value: 'community', label: 'Κοινότητες' },
];

const render = () => renderHook(() => useServerCollection({
    rows: [],
    total: 130,
    page: 1,
    pageSize: 12,
    filterOptions,
    defaultFilterValues: ['council'],
}));

beforeEach(() => {
    mockPending = true;
    push.mockClear();
});

afterEach(() => {
    mockPending = false;
});

describe('useServerCollection while a navigation loads', () => {
    it('shows the selection the reader picked', () => {
        const { result } = render();
        act(() => result.current.setFilters(['community']));
        expect(result.current.selectedFilters).toEqual(['community']);
    });

    it('builds the page links on the selection the reader picked', () => {
        const { result } = render();
        act(() => result.current.setFilters(['community']));
        expect(result.current.hrefForPage(2)).toBe(`?${new URLSearchParams({ filters: 'Κοινότητες', page: '2' })}`);
    });

    it('counts a second Next from the page already asked for', () => {
        const { result } = render();
        act(() => result.current.setPage(result.current.page + 1));
        act(() => result.current.setPage(result.current.page + 1));
        expect(push).toHaveBeenLastCalledWith('/chania/meetings?page=3', { scroll: false });
    });
});
