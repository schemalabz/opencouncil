/** @jest-environment node */
const mockRequest = jest.fn();
jest.mock('@/lib/db/signup', () => ({ getCityChannelRequest: (...args: unknown[]) => mockRequest(...args) }));
const mockSubscription = jest.fn();
jest.mock('@/lib/notis/client', () => ({ getNotisSubscription: (...args: unknown[]) => mockSubscription(...args) }));

import { readerSubscribedToCity } from '@/lib/notis/reader';

const notis = (status: 'active' | 'unsubscribed') => ({
    ok: true as const,
    data: { status, phone: '+306900000001', origin: 'signup', unsubscribedAt: null, createdAt: '2026-09-01T10:00:00.000Z' },
});

beforeEach(() => {
    mockRequest.mockReset();
    mockSubscription.mockReset();
    mockSubscription.mockResolvedValue({ ok: true, data: null });
});

describe('readerSubscribedToCity', () => {
    it('is false for a reader who never asked, without troubling Notis', async () => {
        mockRequest.mockResolvedValue(null);
        expect(await readerSubscribedToCity('user-1', 'chania')).toBe(false);
        expect(mockSubscription).not.toHaveBeenCalled();
    });

    it('is true on the email channel alone, without troubling Notis', async () => {
        mockRequest.mockResolvedValue({ notifyByEmail: true, notifyByPhone: false });
        expect(await readerSubscribedToCity('user-1', 'chania')).toBe(true);
        expect(mockSubscription).not.toHaveBeenCalled();
    });

    /**
     * The reason the request flag is not the answer: a ΣΤΟΠ to Νότης ends the
     * subscription and leaves `notifyByPhone` as it was.
     */
    it('is false once the reader said ΣΤΟΠ, although they asked for the phone channel', async () => {
        mockRequest.mockResolvedValue({ notifyByEmail: false, notifyByPhone: true });
        mockSubscription.mockResolvedValue(notis('unsubscribed'));
        expect(await readerSubscribedToCity('user-1', 'chania')).toBe(false);
    });

    it('is true while Notis serves the reader, whatever the flag says', async () => {
        mockRequest.mockResolvedValue({ notifyByEmail: false, notifyByPhone: false });
        mockSubscription.mockResolvedValue(notis('active'));
        expect(await readerSubscribedToCity('user-1', 'chania')).toBe(true);
    });

    it("falls back to the reader's own request when Notis has not met them", async () => {
        mockSubscription.mockResolvedValue({ ok: true, data: null });
        mockRequest.mockResolvedValue({ notifyByEmail: false, notifyByPhone: true });
        expect(await readerSubscribedToCity('user-1', 'chania')).toBe(true);
        mockRequest.mockResolvedValue({ notifyByEmail: false, notifyByPhone: false });
        expect(await readerSubscribedToCity('user-1', 'chania')).toBe(false);
    });

    /**
     * A reader who is on the list and sees the invitation again meets a signup
     * that says so. One who gets nothing and sees no invitation has no way
     * back, so silence counts as "not reaching them".
     */
    it('is false while Notis does not answer, rather than a guess', async () => {
        mockRequest.mockResolvedValue({ notifyByEmail: false, notifyByPhone: true });
        mockSubscription.mockResolvedValue({ ok: false, reason: 'unreachable' });
        expect(await readerSubscribedToCity('user-1', 'chania')).toBe(false);
    });
});
