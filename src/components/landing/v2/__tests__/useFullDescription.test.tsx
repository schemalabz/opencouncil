import { act, renderHook } from '@testing-library/react';
import { useFullDescription } from '../hooks/useFullDescription';

type Res = { ok: boolean; json: () => Promise<unknown> };
const res = (ok: boolean, body: unknown): Res => ({ ok, json: async () => body });

let fetchMock: jest.Mock;
beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
});
afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
});

const truncated = (id: string) => ({ id, descriptionPreview: 'Η αρχή…', descriptionTruncated: true });
const settle = () => act(async () => {});

describe('useFullDescription', () => {
    it('keeps the preview on a failed answer and asks again on the next selection', async () => {
        fetchMock.mockResolvedValue(res(false, { error: 'Subject not found' }));
        const first = renderHook(() => useFullDescription(truncated('f1'), true));
        await settle();
        expect(first.result.current.description).toBe('Η αρχή…');
        first.unmount();

        fetchMock.mockResolvedValue(res(true, { description: 'Η αρχή και το τέλος.' }));
        const second = renderHook(() => useFullDescription(truncated('f1'), true));
        await settle();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(second.result.current.description).toBe('Η αρχή και το τέλος.');
    });

    it('says more is coming while the request runs, and stops when it lands', async () => {
        fetchMock.mockResolvedValue(res(true, { description: 'Η αρχή και το τέλος.' }));
        const { result } = renderHook(() => useFullDescription(truncated('f5'), true));
        expect(result.current.loading).toBe(true);
        await settle();
        expect(result.current).toEqual({ description: 'Η αρχή και το τέλος.', loading: false });
    });

    it('stops saying more is coming when the request fails', async () => {
        fetchMock.mockResolvedValue(res(false, { error: 'Subject not found' }));
        const { result } = renderHook(() => useFullDescription(truncated('f6'), true));
        expect(result.current.loading).toBe(true);
        await settle();
        expect(result.current).toEqual({ description: 'Η αρχή…', loading: false });
    });

    it('shows the wait again when a card asks again after a failure', async () => {
        fetchMock.mockResolvedValue(res(false, { error: 'Subject not found' }));
        const { result, rerender } = renderHook(({ wanted }: { wanted: boolean }) => useFullDescription(truncated('f8'), wanted), {
            initialProps: { wanted: true },
        });
        await settle();
        expect(result.current.loading).toBe(false);

        rerender({ wanted: false });
        fetchMock.mockReturnValue(new Promise(() => {}));
        rerender({ wanted: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result.current.loading).toBe(true);
    });

    it('is not loading for a card that is not selected', () => {
        const { result } = renderHook(() => useFullDescription(truncated('f7'), false));
        expect(result.current.loading).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps the preview when the answer carries no text', async () => {
        fetchMock.mockResolvedValue(res(true, { description: 5 }));
        const { result } = renderHook(() => useFullDescription(truncated('f2'), true));
        await settle();
        expect(result.current.description).toBe('Η αρχή…');
    });

    it('keeps the preview when the request throws', async () => {
        fetchMock.mockRejectedValue(new TypeError('network'));
        const { result } = renderHook(() => useFullDescription(truncated('f3'), true));
        await settle();
        expect(result.current.description).toBe('Η αρχή…');
    });

    it('shows the preview again once the card is no longer selected, even with the full text cached', async () => {
        fetchMock.mockResolvedValue(res(true, { description: 'Η αρχή και το τέλος.' }));
        const { result, rerender } = renderHook(({ wanted }: { wanted: boolean }) => useFullDescription(truncated('f4'), wanted), {
            initialProps: { wanted: true },
        });
        await settle();
        expect(result.current.description).toBe('Η αρχή και το τέλος.');

        rerender({ wanted: false });
        expect(result.current.description).toBe('Η αρχή…');
        rerender({ wanted: true });
        expect(result.current.description).toBe('Η αρχή και το τέλος.');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
