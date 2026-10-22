import { fireEvent, render, screen } from '@testing-library/react';
import SearchPage from '../SearchPage';
import { search as searchFn } from '@/lib/search';

const push = jest.fn();
const replace = jest.fn();
let mockSearchParams = new URLSearchParams();

// Stable across renders, as in Next: the page keys its search on these.
const mockRouter = { push, replace };
const mockToast = { toast: jest.fn() };

jest.mock('next/navigation', () => ({
    useRouter: () => mockRouter,
    useSearchParams: () => mockSearchParams,
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}:${JSON.stringify(params)}` : key,
}));

jest.mock('@/i18n/routing', () => ({ Link: () => null }));
jest.mock('@/components/ui/search-input-pill', () => ({ SearchInputPill: () => null }));
jest.mock('@/lib/landing/landingCore', () => ({ SEARCH_FIELD_STYLE: {} }));
jest.mock('@/components/landing/v2/controls', () => ({ FilterIconButton: () => null }));
jest.mock('../SearchFilters', () => ({ __esModule: true, default: () => null }));
jest.mock('../SearchFilterSections', () => ({ __esModule: true, default: () => null }));
jest.mock('../hooks/useSearchFilterData', () => ({ useSearchFilterData: () => null }));
jest.mock('@/hooks/useBodyScrollLock', () => ({ useBodyScrollLock: () => {} }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => mockToast }));
jest.mock('@/lib/db/cities', () => ({ getCity: jest.fn() }));
jest.mock('@/lib/db/people', () => ({ getPerson: jest.fn() }));
jest.mock('@/lib/db/parties', () => ({ getParty: jest.fn() }));
jest.mock('@/components/subject/SubjectListContainer', () => ({ SubjectListContainer: () => <div data-testid="results" /> }));
jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn(), captureException: jest.fn() } }));
jest.mock('@/lib/search', () => ({ search: jest.fn() }));

const searchMock = searchFn as jest.MockedFunction<typeof searchFn>;
const scrollIntoView = jest.fn();

/** A search of `total` results, opened at the given URL. Resolves once the results are on screen. */
async function open(query: string, total: number) {
    mockSearchParams = new URLSearchParams(query);
    searchMock.mockResolvedValue({ results: [{ id: 's1' }], total, derivedFilters: {} } as unknown as Awaited<ReturnType<typeof searchFn>>);
    render(<SearchPage />);
    await screen.findByTestId('results');
}

const pageLine = () => screen.getByText(/^pageOf:/).textContent;

beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    searchMock.mockReset();
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
});

describe('SearchPage — paging', () => {
    it('reads a page that is not a positive whole number as page 1', async () => {
        await open('query=σχολειο&page=abc', 40);
        expect(searchMock.mock.calls[0][0].config?.from).toBe(0);
        expect(pageLine()).toBe(`pageOf:${JSON.stringify({ page: 1, total: 3 })}`);
    });

    it('counts a partial last page as a page', async () => {
        await open('query=σχολειο&page=3', 31);
        expect(pageLine()).toBe(`pageOf:${JSON.stringify({ page: 3, total: 3 })}`);
        expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();
    });

    it('pushes the next page and scrolls to the results', async () => {
        await open('query=σχολειο&page=2', 40);
        fireEvent.click(screen.getByRole('button', { name: 'next' }));
        expect(push).toHaveBeenCalledWith(`?${new URLSearchParams({ query: 'σχολειο', page: '3' })}`, { scroll: false });
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.contexts[0]).toHaveClass('scroll-mt-20');
    });

    it('pushes the previous page', async () => {
        await open('query=σχολειο&page=2', 40);
        fireEvent.click(screen.getByRole('button', { name: 'previous' }));
        expect(push).toHaveBeenCalledWith(`?${new URLSearchParams({ query: 'σχολειο', page: '1' })}`, { scroll: false });
    });
});
