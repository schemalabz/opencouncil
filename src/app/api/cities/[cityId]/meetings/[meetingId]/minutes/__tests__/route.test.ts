/** @jest-environment node */

/**
 * A region gets the tables of the decisions page and no minutes document
 * (#993). The JSON feeds the tables, so it stays. The DOCX is the document.
 */
const mockWithUserAuthorizedToEdit = jest.fn();
const mockGetMinutesData = jest.fn();
const mockRenderMinutesDocx = jest.fn();

jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...args: unknown[]) => mockWithUserAuthorizedToEdit(...args),
}));
jest.mock('@/lib/minutes/getMinutesData', () => ({
    getMinutesData: (...args: unknown[]) => mockGetMinutesData(...args),
}));
jest.mock('@/components/meetings/docx/MinutesDocx', () => ({
    renderMinutesDocx: (...args: unknown[]) => mockRenderMinutesDocx(...args),
}));

import { GET } from '../route';

const props = { params: Promise.resolve({ cityId: 'thessalia', meetingId: 'mar4_2026' }) };
const URL_BASE = 'https://opencouncil.gr/api/cities/thessalia/meetings/mar4_2026/minutes';
const dataOf = (authorityType: 'municipality' | 'region') => ({ city: { authorityType }, subjects: [] });

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockWithUserAuthorizedToEdit.mockResolvedValue(true);
    mockRenderMinutesDocx.mockResolvedValue(new Blob(['docx']));
});

afterEach(() => { jest.restoreAllMocks(); });

describe('GET /api/cities/[cityId]/meetings/[meetingId]/minutes', () => {
    it('returns the DOCX of a municipality', async () => {
        mockGetMinutesData.mockResolvedValue(dataOf('municipality'));

        const response = await GET(new Request(URL_BASE), props);

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('wordprocessingml');
        expect(mockRenderMinutesDocx).toHaveBeenCalledTimes(1);
    });

    it('refuses the DOCX of a region with 409 and renders nothing', async () => {
        mockGetMinutesData.mockResolvedValue(dataOf('region'));

        const response = await GET(new Request(URL_BASE), props);

        expect(response.status).toBe(409);
        expect(mockRenderMinutesDocx).not.toHaveBeenCalled();
    });

    it('returns the JSON of a region, which the decisions page reads', async () => {
        mockGetMinutesData.mockResolvedValue(dataOf('region'));

        const response = await GET(new Request(`${URL_BASE}?format=json`), props);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(dataOf('region'));
    });
});
