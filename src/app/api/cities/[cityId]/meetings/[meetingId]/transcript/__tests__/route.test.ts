/** @jest-environment node */
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/export/meetings-server', () => ({ generateMeetingDocxBuffer: jest.fn() }));

import { GET } from '../route';
import { withUserAuthorizedToEdit } from '@/lib/auth';
import { generateMeetingDocxBuffer } from '@/lib/export/meetings-server';
import { NotFoundError } from '@/lib/api/errors';

const mockAuthorize = withUserAuthorizedToEdit as jest.MockedFunction<typeof withUserAuthorizedToEdit>;
const mockGenerate = generateMeetingDocxBuffer as jest.MockedFunction<typeof generateMeetingDocxBuffer>;

const get = () => GET(
    new Request('http://localhost/api/cities/chania/meetings/oct1_2026/transcript'),
    { params: Promise.resolve({ cityId: 'chania', meetingId: 'oct1_2026' }) },
);

beforeEach(() => jest.clearAllMocks());

describe('GET transcript', () => {
    it('returns the document the municipality receives, as a .docx attachment', async () => {
        mockGenerate.mockResolvedValue(Buffer.from('docx bytes'));

        const response = await get();

        expect(mockAuthorize).toHaveBeenCalledWith({ councilMeetingId: 'oct1_2026', cityId: 'chania' });
        expect(mockGenerate).toHaveBeenCalledWith('chania', 'oct1_2026');
        expect(response.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="chania_council_meeting_oct1_2026.docx"');
        expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('docx bytes');
    });

    it('answers 404 for a meeting that has no transcript yet', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
        mockGenerate.mockRejectedValue(new NotFoundError('Transcript not found for meeting: chania/oct1_2026'));

        const response = await get();

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'Transcript not found for meeting: chania/oct1_2026' });
    });

    it('builds nothing for a user who may not edit the meeting', async () => {
        mockAuthorize.mockRejectedValue(new Error('Not authorized'));

        await expect(get()).rejects.toThrow('Not authorized');
        expect(mockGenerate).not.toHaveBeenCalled();
    });
});
