/** @jest-environment node */

const mockFindUnique = jest.fn();

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        decision: {
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
        },
    },
}));

import { getDecisionForSubject } from '../decisions';

const decisionRow = (publishDate: Date | null, timezone = 'Europe/Athens') => ({
    ada: 'ΨΞΚ1',
    decisionNumber: '670/2026',
    protocolNumber: '261/2026',
    title: 'Έγκριση απόφασης Δημάρχου',
    pdfUrl: 'https://diavgeia.gov.gr/doc/ΨΞΚ1',
    publishDate,
    updatedAt: new Date('2026-07-25T08:00:00.000Z'),
    subject: { councilMeeting: { city: { timezone } } },
});

beforeEach(() => jest.clearAllMocks());

describe('getDecisionForSubject', () => {
    it("reports the city's calendar date for an instant published late in the evening", async () => {
        // 21:30 UTC is 00:30 the next day in Athens summer. Serializing the
        // instant handed the page a UTC day, which it printed a day early.
        mockFindUnique.mockResolvedValue(decisionRow(new Date('2026-07-24T21:30:00.000Z')));
        const decision = await getDecisionForSubject('sub-1');
        expect(decision?.publishDate).toBe('2026-07-25');
    });

    it('reads the date in the city we hold, not in Athens', async () => {
        mockFindUnique.mockResolvedValue(decisionRow(new Date('2026-07-24T22:30:00.000Z'), 'Europe/Belgrade'));
        const decision = await getDecisionForSubject('sub-1');
        expect(decision?.publishDate).toBe('2026-07-25');
    });

    it('keeps updatedAt an instant, because the page shows it as a relative time', async () => {
        mockFindUnique.mockResolvedValue(decisionRow(null));
        const decision = await getDecisionForSubject('sub-1');
        expect(decision?.publishDate).toBeNull();
        expect(decision?.updatedAt).toBe('2026-07-25T08:00:00.000Z');
    });

    it('returns null when the subject carries no decision', async () => {
        mockFindUnique.mockResolvedValue(null);
        await expect(getDecisionForSubject('sub-1')).resolves.toBeNull();
    });
});
