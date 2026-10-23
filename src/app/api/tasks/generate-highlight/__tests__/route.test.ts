/** @jest-environment node */
import { NextRequest } from 'next/server';

jest.mock('@/lib/db/tasks', () => ({ getGenerateHighlightTasksForHighlight: jest.fn() }));
jest.mock('@/lib/tasks/generateHighlight', () => ({ requestGenerateHighlight: jest.fn() }));

import { GET, POST } from '@/app/api/tasks/generate-highlight/route';
import { requestGenerateHighlight } from '@/lib/tasks/generateHighlight';
import { getGenerateHighlightTasksForHighlight } from '@/lib/db/tasks';
import { validationErrorSchema } from '@/lib/api/errors';

describe('GET /api/tasks/generate-highlight', () => {
    it('returns the progress of a task and nothing else', async () => {
        (getGenerateHighlightTasksForHighlight as jest.Mock).mockResolvedValue([{
            id: 't1', type: 'generateHighlight', status: 'pending', stage: 'rendering', percentComplete: 40,
            createdAt: new Date('2026-10-23T10:00:00Z'), updatedAt: new Date('2026-10-23T10:01:00Z'),
            requestBody: '{"callbackUrl":"https://app/x?token=secret"}', responseBody: null,
            failureReason: 'internal detail', version: 2, cityId: 'athens', councilMeetingId: 'm1',
        }]);

        const response = await GET(new NextRequest('http://localhost/api/tasks/generate-highlight?cityId=athens&meetingId=m1&highlightId=h1'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([{
            id: 't1', status: 'pending', stage: 'rendering', percentComplete: 40,
            createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T10:01:00.000Z',
        }]);
    });
});

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/tasks/generate-highlight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
}));
const request = requestGenerateHighlight as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    request.mockResolvedValue({ id: 'task-1' });
});

describe('POST /api/tasks/generate-highlight', () => {
    it('starts a render with the options the dialog sends', async () => {
        const options = {
            includeCaptions: true,
            includeSpeakerOverlay: true,
            aspectRatio: 'social-9x16',
            socialOptions: { marginType: 'blur', zoomFactor: 1.0 },
        };
        const response = await post({ highlightId: 'h1', options });

        expect(response.status).toBe(201);
        expect(request).toHaveBeenCalledWith('h1', options);
    });

    it('starts a render without options', async () => {
        const response = await post({ highlightId: 'h1' });

        expect(response.status).toBe(201);
        expect(request).toHaveBeenCalledWith('h1', undefined);
    });

    it.each([
        ['a missing highlightId', {}, ['highlightId']],
        ['a color that is not hex', {
            highlightId: 'h1',
            options: { aspectRatio: 'social-9x16', socialOptions: { marginType: 'solid', backgroundColor: '0x000000:x=1,drawtext=text=x' } },
        }, ['options', 'socialOptions', 'backgroundColor']],
        ['a zoom that is a string', {
            highlightId: 'h1',
            options: { aspectRatio: 'social-9x16', socialOptions: { marginType: 'blur', zoomFactor: '1' } },
        }, ['options', 'socialOptions', 'zoomFactor']],
        ['an unknown option', { highlightId: 'h1', options: { captionStyle: 'pop' } }, ['options']],
    ])('answers %s with a 400 ValidationError and starts nothing', async (_label, body, path) => {
        const response = await post(body);

        expect(response.status).toBe(400);
        const parsed = validationErrorSchema.parse(await response.json());
        expect(parsed.error.map(issue => issue.path)).toContainEqual(path);
        expect(request).not.toHaveBeenCalled();
    });

    it('keeps the message of a refusal from the authorization check', async () => {
        request.mockRejectedValue(new Error('Not authorized to generate this highlight'));

        const response = await post({ highlightId: 'h1' });

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Not authorized to generate this highlight' });
    });
});
