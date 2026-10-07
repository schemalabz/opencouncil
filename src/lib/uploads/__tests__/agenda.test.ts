/** @jest-environment node */

const mockSend = jest.fn();
const mockAvailableUploadKey = jest.fn();

jest.mock('@/env.mjs', () => ({
    env: { DO_SPACES_BUCKET: 'bucket', DO_SPACES_ENDPOINT: 'https://fra1.digitaloceanspaces.com', CDN_URL: 'https://cdn.example.com' },
}));
jest.mock('@/lib/s3', () => ({
    s3Client: { send: (...args: unknown[]) => mockSend(...args) },
    constructPublicUrl: (bucket: string, key: string) => `https://${bucket}.fra1.digitaloceanspaces.com/${key}`,
}));
jest.mock('../naming', () => ({ availableUploadKey: (...args: unknown[]) => mockAvailableUploadKey(...args) }));

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { copyAgendaToStorage, detectAgendaFormat } from '../agenda';
import { BadRequestError } from '@/lib/api/errors';

const PDF_BYTES = Buffer.from('%PDF-1.7\n...');
const DOCX_BYTES = Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), Buffer.from('....word/document.xml....')]);
const HTML_BYTES = Buffer.from('<!doctype html><html><body>Ημερήσια διάταξη</body></html>');

const respondWith = (body: Buffer, init: ResponseInit = {}) =>
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(body), init));

beforeEach(() => {
    jest.restoreAllMocks();
    mockSend.mockReset().mockResolvedValue({});
    mockAvailableUploadKey.mockReset().mockImplementation(async (config, extension) =>
        `uploads/${config.cityId}_${config.identifier}_${config.suffix}.${extension}`);
});

describe('detectAgendaFormat', () => {
    it('reads the format from the bytes', () => {
        expect(detectAgendaFormat(PDF_BYTES)?.extension).toBe('pdf');
        expect(detectAgendaFormat(DOCX_BYTES)?.extension).toBe('docx');
        expect(detectAgendaFormat(HTML_BYTES)).toBeNull();
        // Another zip, such as an .xlsx, is not a .docx.
        expect(detectAgendaFormat(Buffer.from('PK\x03\x04xl/workbook.xml', 'latin1'))).toBeNull();
    });
});

describe('copyAgendaToStorage', () => {
    it('stores a PDF under the name of an admin page upload, public, and returns its URL', async () => {
        respondWith(PDF_BYTES, { headers: { 'content-type': 'application/octet-stream' } });
        const url = await copyAgendaToStorage('skiathos', 'oct2_2026', 'https://skiathos.gr/agenda.pdf');

        expect(mockAvailableUploadKey).toHaveBeenCalledWith({ cityId: 'skiathos', identifier: 'oct2_2026', suffix: 'agenda' }, 'pdf');
        const command = mockSend.mock.calls[0][0] as PutObjectCommand;
        expect(command.input).toMatchObject({
            Bucket: 'bucket', Key: 'uploads/skiathos_oct2_2026_agenda.pdf', ContentType: 'application/pdf', ACL: 'public-read',
        });
        expect(url).toBe('https://bucket.fra1.digitaloceanspaces.com/uploads/skiathos_oct2_2026_agenda.pdf');
    });

    it('stores a .docx with its own extension', async () => {
        respondWith(DOCX_BYTES);
        const url = await copyAgendaToStorage('skiathos', 'oct2_2026', 'https://skiathos.gr/agenda.docx');
        expect(url).toMatch(/_agenda\.docx$/);
    });

    it('refuses an HTML page and stores nothing', async () => {
        respondWith(HTML_BYTES, { headers: { 'content-type': 'text/html' } });
        await expect(copyAgendaToStorage('skiathos', 'oct2_2026', 'https://skiathos.gr/agenda'))
            .rejects.toThrow(/not a PDF or a \.docx file \(content type: text\/html\)/);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('refuses an answer that is not a success', async () => {
        respondWith(Buffer.from('gone'), { status: 404 });
        await expect(copyAgendaToStorage('skiathos', 'm', 'https://skiathos.gr/x.pdf')).rejects.toThrow(/HTTP 404/);
    });

    it('refuses a scheme other than http and https without a fetch', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch');
        await expect(copyAgendaToStorage('skiathos', 'm', 'file:///etc/passwd')).rejects.toThrow(BadRequestError);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns a URL that is already in our storage as it is', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch');
        const own = 'https://bucket.fra1.digitaloceanspaces.com/uploads/skiathos_oct2_2026_agenda.pdf';
        await expect(copyAgendaToStorage('skiathos', 'oct2_2026', own)).resolves.toBe(own);
        await expect(copyAgendaToStorage('skiathos', 'oct2_2026', 'https://cdn.example.com/uploads/a.pdf'))
            .resolves.toBe('https://cdn.example.com/uploads/a.pdf');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
