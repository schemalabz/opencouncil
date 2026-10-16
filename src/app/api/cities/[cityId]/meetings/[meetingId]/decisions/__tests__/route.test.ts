/** @jest-environment node */

jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('@/auth', () => ({ auth: jest.fn().mockResolvedValue({ user: { id: 'u1' } }) }));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn(), withUserAuthorizedToEdit: jest.fn() }));
jest.mock('@/lib/db/decisions', () => ({
    getDecisionsForMeeting: jest.fn(),
    getExtractedDataForMeeting: jest.fn(),
    upsertDecision: jest.fn().mockResolvedValue({ id: 'd1' }),
    deleteDecision: jest.fn(),
    clearExtractedDataForMeeting: jest.fn(),
    resetExtractionForSubject: jest.fn(),
}));
jest.mock('@/lib/db/decisionCandidates', () => ({ dismissCandidate: jest.fn() }));
jest.mock('@/lib/derivation/persist', () => ({}));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { subject: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) }, decision: { findUnique: jest.fn() } },
}));

import { POST, PUT } from '@/app/api/cities/[cityId]/meetings/[meetingId]/decisions/route';
import { upsertDecision } from '@/lib/db/decisions';
import { dismissCandidate } from '@/lib/db/decisionCandidates';
import { DecisionWriteError } from '@/lib/utils/decisionWriteCause';

const put = (pdfUrl: string) => PUT(
    new Request('http://localhost/api/cities/athens/meetings/m1/decisions', {
        method: 'PUT',
        body: JSON.stringify({ subjectId: 's1', pdfUrl }),
    }),
    { params: Promise.resolve({ cityId: 'athens', meetingId: 'm1' }) },
);

describe('PUT decisions pdfUrl', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each(['javascript:alert(1)', 'data:application/pdf;base64,AAAA', 'ftp://example.com/a.pdf', 'not a url'])(
        'refuses %s with 400', async (pdfUrl) => {
            const response = await put(pdfUrl);
            expect(response.status).toBe(400);
            expect(upsertDecision).not.toHaveBeenCalled();
        });

    it('takes a Diavgeia document URL', async () => {
        const response = await put('https://diavgeia.gov.gr/doc/ΨΚΖ7ΩΗ5-ΑΡΚ');
        expect(response.status).toBe(200);
        expect(upsertDecision).toHaveBeenCalledWith(expect.objectContaining({ pdfUrl: 'https://diavgeia.gov.gr/doc/ΨΚΖ7ΩΗ5-ΑΡΚ' }));
    });
});

describe('POST decisions write failures', () => {
    const dismiss = () => POST(
        new Request('http://localhost/api/cities/athens/meetings/m1/decisions', {
            method: 'POST',
            body: JSON.stringify({ action: 'dismissCandidate', candidateId: 'c1' }),
        }),
        { params: Promise.resolve({ cityId: 'athens', meetingId: 'm1' }) },
    );

    beforeEach(() => jest.clearAllMocks());

    it('answers a refused write with 409 and its cause', async () => {
        (dismissCandidate as jest.Mock).mockRejectedValue(new DecisionWriteError({ code: 'candidateResolved' }, 'Candidate is already resolved'));

        const response = await dismiss();

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Candidate is already resolved', code: 'candidateResolved' });
    });

    it('answers any other failure with a 500 that does not carry its message', async () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        (dismissCandidate as jest.Mock).mockRejectedValue(new Error('Invalid `prisma.decisionCandidate.update()` invocation'));

        const response = await dismiss();

        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: 'Failed to run the decision action' });
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });
});
