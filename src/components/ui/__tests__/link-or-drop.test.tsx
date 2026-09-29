import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LinkOrDrop } from '../link-or-drop';

const pdf = new File(['%PDF-1.4'], 'decision.pdf', { type: 'application/pdf' });
const image = new File(['png'], 'photo.png', { type: 'image/png' });

const fetchMock = jest.fn();

beforeEach(() => {
    // The first upload call fails, so an accepted file stops after the request.
    fetchMock.mockReset().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'no upload in tests' }) });
    global.fetch = fetchMock;
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
    it('gives the file picker the accepted types', () => {
        const { container } = render(<LinkOrDrop accept="application/pdf" />);
        expect(fileInput(container)).toHaveAttribute('accept', 'application/pdf');
    });

    it('rejects a dropped file of another type when accept is set', async () => {
        const { container } = render(<LinkOrDrop accept="application/pdf" />);
        drop(container, image);
        expect(await screen.findByText(/This file type is not accepted/)).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a picked file of another type when accept is set', async () => {
        const { container } = render(<LinkOrDrop accept="application/pdf" />);
        fireEvent.change(fileInput(container), { target: { files: [image] } });
        expect(await screen.findByText(/This file type is not accepted/)).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uploads a dropped file of an accepted type', async () => {
        const { container } = render(<LinkOrDrop accept="application/pdf" />);
        drop(container, pdf);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/upload/presigned-url', expect.anything()));
    });

    it('uploads a PDF the browser gave no type, and names its type for the upload', async () => {
        const untyped = new File(['%PDF-1.4'], 'x.PDF', { type: '' });
        const { container } = render(<LinkOrDrop accept="application/pdf,.pdf" />);
        drop(container, untyped);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/upload/presigned-url', expect.anything()));
        const [, init] = fetchMock.mock.calls[0];
        expect(JSON.parse(init.body)).toMatchObject({ filename: 'x.PDF', contentType: 'application/pdf' });
    });

    it('rejects an image when accept lists the PDF type and extension', async () => {
        const { container } = render(<LinkOrDrop accept="application/pdf,.pdf" />);
        drop(container, image);
        expect(await screen.findByText(/This file type is not accepted/)).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uploads any file when accept is not set', async () => {
        const { container } = render(<LinkOrDrop />);
        drop(container, image);
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/upload/presigned-url', expect.anything()));
        expect(screen.queryByText(/This file type is not accepted/)).not.toBeInTheDocument();
    });
});
