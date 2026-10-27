import { act, renderHook } from '@testing-library/react';
import { useCommittedSearch } from '../hooks/useCommittedSearch';
import { EMPTY_FILTERS, type DateRangeKey, type MapFilters } from '@/lib/landing/landingCore';

jest.mock('@/lib/landing/analytics', () => ({ captureLanding: jest.fn() }));

const EMPTY_ANSWER = { located: [], general: [], order: [], total: 0, truncated: false, derivedFilters: {} };

let fetchMock: jest.Mock;
beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => EMPTY_ANSWER });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
});
afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
});

const settle = () => act(async () => {});
const requestedUrl = (call: number) => new URL(fetchMock.mock.calls[call][0], 'http://localhost');

type Props = { range: DateRangeKey; filters: MapFilters };
const render = (initial: Props) =>
    renderHook(
        ({ range, filters }: Props) => useCommittedSearch({ cats: [], range, filters, onDerivedFilters: () => {} }),
        { initialProps: initial },
    );

describe('useCommittedSearch date window', () => {
    it('commits a search under the quick-range pill', async () => {
        const { result } = render({ range: '14d', filters: EMPTY_FILTERS });

        act(() => result.current.commit('παιδικοί σταθμοί'));
        await settle();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(requestedUrl(0).searchParams.get('daysBack')).toBe('14');
        expect(requestedUrl(0).searchParams.get('extract')).toBeNull();
    });

    // A pill change is a filter change: the search runs again under the new
    // window, without reading the query text a second time.
    it('re-runs the search when the pill changes', async () => {
        const { result, rerender } = render({ range: '3m', filters: EMPTY_FILTERS });
        act(() => result.current.commit('παιδικοί σταθμοί'));
        await settle();

        rerender({ range: '14d', filters: EMPTY_FILTERS });
        await settle();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(requestedUrl(1).searchParams.get('daysBack')).toBe('14');
        expect(requestedUrl(1).searchParams.get('monthsBack')).toBeNull();
        expect(requestedUrl(1).searchParams.get('extract')).toBe('false');
    });

    it('sends the explicit dates instead of the pill', async () => {
        const { result } = render({ range: '14d', filters: { ...EMPTY_FILTERS, dateFrom: '2026-02-01' } });

        act(() => result.current.commit('παιδικοί σταθμοί'));
        await settle();

        expect(requestedUrl(0).searchParams.get('dateFrom')).toBe('2026-02-01');
        expect(requestedUrl(0).searchParams.get('daysBack')).toBeNull();
    });

    it('does not re-run when the pill changes under no search', async () => {
        const { rerender } = render({ range: '3m', filters: EMPTY_FILTERS });

        rerender({ range: '14d', filters: EMPTY_FILTERS });
        await settle();

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
