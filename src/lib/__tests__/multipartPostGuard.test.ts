import { isHeaderlessMultipartPost } from '../multipartPostGuard';

const MULTIPART = 'multipart/form-data; boundary=----WebKitFormBoundaryx8jO2oVc6SWP3Sad';
const ACTION_ID = '7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d';

describe('isHeaderlessMultipartPost', () => {
    it('flags a multipart POST that carries no Next-Action header', () => {
        expect(isHeaderlessMultipartPost('POST', MULTIPART, null)).toBe(true);
    });

    it('lets a server action with a file argument through (multipart with the header)', () => {
        expect(isHeaderlessMultipartPost('POST', MULTIPART, ACTION_ID)).toBe(false);
    });

    it('treats an empty Next-Action header as present, as Next does', () => {
        expect(isHeaderlessMultipartPost('POST', MULTIPART, '')).toBe(false);
    });

    it('lets a plain server action through (text/plain with the header)', () => {
        expect(isHeaderlessMultipartPost('POST', 'text/plain;charset=UTF-8', ACTION_ID)).toBe(false);
    });

    it('ignores non-multipart POSTs, which Next answers with the page', () => {
        expect(isHeaderlessMultipartPost('POST', 'application/x-www-form-urlencoded', null)).toBe(false);
        expect(isHeaderlessMultipartPost('POST', 'application/json', null)).toBe(false);
        expect(isHeaderlessMultipartPost('POST', null, null)).toBe(false);
    });

    it('matches the media type case-sensitively, exactly as Next classifies it', () => {
        // Next never routes `Multipart/Form-Data` to the action handler; it renders the page.
        expect(isHeaderlessMultipartPost('POST', 'Multipart/Form-Data; boundary=x', null)).toBe(false);
    });

    it('ignores other methods regardless of content type', () => {
        expect(isHeaderlessMultipartPost('GET', MULTIPART, null)).toBe(false);
        expect(isHeaderlessMultipartPost('PUT', MULTIPART, null)).toBe(false);
    });
});
