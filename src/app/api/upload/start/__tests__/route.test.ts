/** @jest-environment node */
jest.mock('@/lib/auth', () => ({ withRight: jest.fn() }));
jest.mock('@/env.mjs', () => ({
    env: { DO_SPACES_ENDPOINT: 'https://fra1.digitaloceanspaces.com', DO_SPACES_BUCKET: 'bucket', NEXTAUTH_SECRET: 'test-secret' },
}));
jest.mock('@/lib/uploads', () => ({
    ...jest.requireActual('@/lib/uploads'),
    startUpload: jest.fn().mockResolvedValue({ key: 'k', completion: null }),
}));

import { POST } from '../route';
import { withRight } from '@/lib/auth';
import { startUpload } from '@/lib/uploads';
import { ForbiddenError } from '@/lib/api/errors';

const guard = withRight as jest.Mock;
const post = (body: unknown) => POST({ json: async () => body } as never);
const AGENDA = { filename: 'Agenda.PDF', sizeBytes: 1000, config: { cityId: 'chania', kind: 'agenda', councilMeetingId: 'nov5_2026' } };

beforeEach(() => {
    jest.clearAllMocks();
    guard.mockResolvedValue(true);
});

describe('POST /api/upload/start', () => {
    it('authorizes the right of the kind on the scope of the config, and starts the upload in the format of the file', async () => {
        const response = await post(AGENDA);

        expect(response.status).toBe(200);
        expect(guard).toHaveBeenCalledWith('admin', { cityId: 'chania', councilMeetingId: 'nov5_2026' });
        expect(startUpload).toHaveBeenCalledWith(AGENDA.config, 'pdf', 1000);
        expect(await response.json()).toEqual({ key: 'k', completion: null });
    });

    it('asks for records.edit for a decision', async () => {
        const response = await post({ ...AGENDA, config: { ...AGENDA.config, kind: 'decision' } });

        expect(response.status).toBe(200);
        expect(guard).toHaveBeenCalledWith('records.edit', { cityId: 'chania', councilMeetingId: 'nov5_2026' });
    });

    it('refuses a caller who may not edit the meeting, before it signs anything', async () => {
        guard.mockRejectedValue(new ForbiddenError('no'));
        expect((await post(AGENDA)).status).toBe(403);
        expect(startUpload).not.toHaveBeenCalled();
    });

    it('refuses a file that the kind does not take', async () => {
        const response = await post({ ...AGENDA, filename: 'agenda.doc' });
        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe('An upload of kind agenda takes pdf or docx, not a .doc file');
        expect(startUpload).not.toHaveBeenCalled();
    });

    it('refuses a request without a known kind or a size', async () => {
        expect((await post({ ...AGENDA, config: { cityId: 'chania', kind: 'logo' } })).status).toBe(400);
        expect((await post({ ...AGENDA, sizeBytes: undefined })).status).toBe(400);
        expect(guard).not.toHaveBeenCalled();
    });
});
