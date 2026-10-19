/** @jest-environment node */
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/db/subject', () => ({ getPublicSubjectDescription: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getPublicSubjectDescription } from '@/lib/db/subject';

const descriptionMock = getPublicSubjectDescription as jest.Mock;
const get = (subjectId: string) =>
    GET(new NextRequest(`http://localhost/api/subject/${subjectId}/description`), { params: Promise.resolve({ subjectId }) });

beforeEach(() => jest.clearAllMocks());

describe('GET /api/subject/[subjectId]/description', () => {
    it('answers the description as plain text, cacheable', async () => {
        descriptionMock.mockResolvedValue('Συζήτηση για το [πάρκο](REF:UTTERANCE:u1) της **οδού**.');

        const res = await get('s1');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ description: 'Συζήτηση για το πάρκο της οδού.' });
        expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300');
        expect(descriptionMock).toHaveBeenCalledWith('s1', 'greece');
    });

    // A subject the reader may not see — unreleased, a city that is not public, or a city of
    // another realm — looks exactly like one that does not exist.
    it('answers 404 for a subject that is missing or hidden', async () => {
        descriptionMock.mockResolvedValue(null);

        const res = await get('hidden');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'Subject not found' });
        expect(res.headers.get('cache-control')).toBeNull();
    });

    it('answers an unexpected failure as a 500 ErrorResponse, not cacheable', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        descriptionMock.mockRejectedValue(new Error('connection refused at 10.0.0.5'));

        const res = await get('s1');

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Failed to load the subject description' });
        expect(res.headers.get('cache-control')).toBeNull();
        consoleError.mockRestore();
    });
});
