import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LinkOrDrop, PUT_STALL_MS } from '../link-or-drop';
import type { UploadConfig } from '@/types/upload';
import { startUploadRequestSchema } from '@/lib/zod-schemas/upload';

const DECISION: UploadConfig = { cityId: 'chania', kind: 'decision', identifier: 'm1_s1' };
const RECORDING: UploadConfig = { cityId: 'chania', kind: 'recording', councilMeetingId: 'nov5_2026' };
const pdf = new File(['%PDF-1.4'], 'decision.pdf', { type: 'application/pdf' });
const image = new File(['png'], 'photo.png', { type: 'image/png' });

const fetchMock = jest.fn();
const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });

/**
 * The PUTs to the bucket: each one records what it sent and, in the default
 * mode, answers 200. In manual mode a PUT waits for the test to drive it.
 */
const puts: { url: string; headers: Record<string, string>; body: Blob; xhr: FakeXhr }[] = [];
let manual = false;
class FakeXhr {
    upload: { onprogress?: (event: { loaded: number }) => void } = {};
    onload?: () => void;
    onabort?: () => void;
    status = 200;
    private url = '';
    private headers: Record<string, string> = {};
    open(_method: string, url: string) { this.url = url; }
    setRequestHeader(name: string, value: string) { this.headers[name] = value; }
    abort() { this.onabort?.(); }
    send(body: Blob) {
        puts.push({ url: this.url, headers: this.headers, body, xhr: this });
        if (!manual) setTimeout(() => { this.upload.onprogress?.({ loaded: body.size }); this.onload?.(); });
    }
}

beforeEach(() => {
    puts.length = 0;
    manual = false;
    // The first upload call fails, so an accepted file stops after the request.
    fetchMock.mockReset().mockResolvedValue(json({ error: 'no upload in tests' }, 500));
    global.fetch = fetchMock;
    global.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
});

const fileInput = (container: HTMLElement): HTMLInputElement => {
    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
    return input;
};

const drop = (container: HTMLElement, file: File) => {
    const zone = fileInput(container).closest('.relative');
    if (!zone) throw new Error('no drop zone');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
};

describe('LinkOrDrop', () => {
    it('gives the file picker the types of the kind', () => {
        const { container } = render(<LinkOrDrop config={DECISION} />);
        expect(fileInput(container)).toHaveAttribute('accept', '.pdf,application/pdf');
    });

    it('rejects a dropped file that the kind does not take', async () => {
        const { container } = render(<LinkOrDrop config={DECISION} />);
        drop(container, image);
        expect(await screen.findByText(/This file type is not accepted/)).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a picked file that the kind does not take', async () => {
        const { container } = render(<LinkOrDrop config={DECISION} />);
        fireEvent.change(fileInput(container), { target: { files: [image] } });
        expect(await screen.findByText(/This file type is not accepted/)).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('starts the upload of a PDF that the browser gave no type, with its name, size and config', async () => {
        const untyped = new File(['%PDF-1.4'], 'x.PDF', { type: '' });
        const { container } = render(<LinkOrDrop config={DECISION} />);
        drop(container, untyped);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/upload/start', expect.anything()));
        const [, init] = fetchMock.mock.calls[0];
        expect(JSON.parse(init.body)).toEqual({ filename: 'x.PDF', sizeBytes: 8, config: DECISION });
    });

    it('shows the refusal of the start route', async () => {
        fetchMock.mockResolvedValueOnce(json({ error: 'An upload of kind decision takes at most 20 MiB (20971520 bytes), not 30000000 bytes' }, 400));
        const { container } = render(<LinkOrDrop config={DECISION} />);
        drop(container, pdf);
        expect(await screen.findByText(/takes at most 20 MiB/)).toBeInTheDocument();
    });

    it('shows the validation message when an empty file is refused', async () => {
        const file = new File([], 'empty.mp4', { type: 'video/mp4' });
        const parsed = startUploadRequestSchema.safeParse({ filename: file.name, sizeBytes: file.size, config: RECORDING });
        if (parsed.success) throw new Error('expected the schema to refuse an empty file');
        const error = parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }));
        fetchMock.mockResolvedValueOnce(json({ error }, 400));
        const onUrlChange = jest.fn();
        const { container } = render(<LinkOrDrop config={RECORDING} onUrlChange={onUrlChange} />);

        drop(container, file);

        expect(await screen.findByText(`sizeBytes: ${error[0].message}`)).toBeInTheDocument();
        expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
        expect(puts).toHaveLength(0);
        expect(onUrlChange).not.toHaveBeenCalled();
    });

    it('sends a small file in one PUT with the planned headers, and reports its public URL', async () => {
        fetchMock.mockResolvedValueOnce(json({
            key: 'k', publicUrl: 'https://bucket.test/k.pdf', method: 'PUT',
            headers: { 'Content-Type': 'application/pdf', 'x-amz-acl': 'public-read' },
            partSize: pdf.size, parts: [{ partNumber: 1, uploadUrl: 'https://bucket.test/put' }], expiresIn: 300, completion: null,
        }));
        const onUrlChange = jest.fn();
        const { container } = render(<LinkOrDrop config={DECISION} onUrlChange={onUrlChange} />);
        drop(container, pdf);

        await waitFor(() => expect(onUrlChange).toHaveBeenCalledWith('https://bucket.test/k.pdf'));
        expect(puts).toHaveLength(1);
        expect(puts[0]).toMatchObject({ url: 'https://bucket.test/put', headers: { 'Content-Type': 'application/pdf', 'x-amz-acl': 'public-read' } });
        expect(puts[0].body.size).toBe(pdf.size);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sends a big file in parts of the planned size, then completes the upload', async () => {
        const video = new File(['0123456789'], 'sitting.mp4', { type: 'video/mp4' });
        fetchMock
            .mockResolvedValueOnce(json({
                key: 'uploads/k.mp4', publicUrl: 'https://bucket.test/k.mp4', method: 'PUT', headers: {}, partSize: 4,
                parts: [1, 2, 3].map(n => ({ partNumber: n, uploadUrl: `https://bucket.test/part-${n}` })),
                expiresIn: 43200, completion: { uploadId: 'u1', token: 't' },
            }))
            .mockResolvedValueOnce(json({ key: 'uploads/k.mp4', publicUrl: 'https://bucket.test/k.mp4', sizeBytes: 10 }));
        const onUrlChange = jest.fn();
        const { container } = render(<LinkOrDrop config={RECORDING} onUrlChange={onUrlChange} />);
        drop(container, video);

        await waitFor(() => expect(onUrlChange).toHaveBeenCalledWith('https://bucket.test/k.mp4'));
        expect(puts.map(p => [p.url, p.body.size])).toEqual([
            ['https://bucket.test/part-1', 4], ['https://bucket.test/part-2', 4], ['https://bucket.test/part-3', 2],
        ]);
        const [url, init] = fetchMock.mock.calls[1];
        expect(url).toBe('/api/upload/complete');
        expect(JSON.parse(init.body)).toEqual({ key: 'uploads/k.mp4', uploadId: 'u1', token: 't', sizeBytes: 10 });
    });

    it('does not report a URL when the parts cannot be joined', async () => {
        const video = new File(['0123456789'], 'sitting.mp4', { type: 'video/mp4' });
        fetchMock
            .mockResolvedValueOnce(json({
                key: 'k', publicUrl: 'https://bucket.test/k.mp4', method: 'PUT', headers: {}, partSize: 8,
                parts: [1, 2].map(n => ({ partNumber: n, uploadUrl: `https://bucket.test/part-${n}` })),
                expiresIn: 43200, completion: { uploadId: 'u1', token: 't' },
            }))
            .mockResolvedValueOnce(json({ error: 'Part 2 of 2 is missing' }, 400));
        const onUrlChange = jest.fn();
        const { container } = render(<LinkOrDrop config={RECORDING} onUrlChange={onUrlChange} />);
        drop(container, video);

        expect(await screen.findByText(/Part 2 of 2 is missing/)).toBeInTheDocument();
        expect(onUrlChange).not.toHaveBeenCalled();
    });

    describe('a PUT that takes long', () => {
        const SINGLE = {
            key: 'k', publicUrl: 'https://bucket.test/k.mp4', method: 'PUT', headers: {}, partSize: 10,
            parts: [{ partNumber: 1, uploadUrl: 'https://bucket.test/put' }], expiresIn: 300, completion: null,
        };
        const video = new File(['0123456789'], 'sitting.mp4', { type: 'video/mp4' });

        beforeEach(() => {
            manual = true;
            jest.useFakeTimers();
            fetchMock.mockResolvedValueOnce(json(SINGLE));
        });
        afterEach(() => jest.useRealTimers());

        async function startPut(onUrlChange: jest.Mock) {
            const { container } = render(<LinkOrDrop config={RECORDING} onUrlChange={onUrlChange} />);
            drop(container, video);
            await waitFor(() => expect(puts).toHaveLength(1));
            return puts[0].xhr;
        }

        it('stops when no data moves for the stall limit', async () => {
            const onUrlChange = jest.fn();
            await startPut(onUrlChange);
            act(() => { jest.advanceTimersByTime(PUT_STALL_MS); });
            expect(await screen.findByText(/Upload stalled/)).toBeInTheDocument();
            expect(onUrlChange).not.toHaveBeenCalled();
        });

        it('keeps going for as long as data moves, past any fixed limit', async () => {
            const onUrlChange = jest.fn();
            const xhr = await startPut(onUrlChange);
            // An hour of a slow line: progress every minute.
            for (let minute = 1; minute <= 60; minute++) {
                act(() => {
                    jest.advanceTimersByTime(60 * 1000);
                    xhr.upload.onprogress?.({ loaded: minute });
                });
            }
            act(() => { xhr.onload?.(); });
            await waitFor(() => expect(onUrlChange).toHaveBeenCalledWith('https://bucket.test/k.mp4'));
            expect(screen.queryByText(/Upload stalled/)).not.toBeInTheDocument();
        });
    });
});
