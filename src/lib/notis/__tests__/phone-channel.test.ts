import { notisStatusFromChannelState, notisStatusOf, phoneChannelFor } from '../phone-channel';

const active = {
    status: 'active' as const,
    phone: '+306900000001',
    origin: 'signup',
    unsubscribedAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
};

describe('notisStatusOf', () => {
    it("reads a subscription's status, and none as null", () => {
        expect(notisStatusOf({ ok: true, data: active })).toBe('active');
        expect(notisStatusOf({ ok: true, data: { ...active, status: 'unsubscribed' } })).toBe('unsubscribed');
        expect(notisStatusOf({ ok: true, data: null })).toBeNull();
        expect(notisStatusOf(null)).toBeNull();
    });

    it('tells silence from absence: unreachable is unknown, unconfigured is null', () => {
        expect(notisStatusOf({ ok: false, reason: 'unreachable' })).toBe('unknown');
        expect(notisStatusOf({ ok: false, reason: 'rejected', status: 500, code: null })).toBe('unknown');
        expect(notisStatusOf({ ok: false, reason: 'unconfigured' })).toBeNull();
    });
});

describe('notisStatusFromChannelState', () => {
    it('maps the profile read the same way', () => {
        expect(notisStatusFromChannelState({ configured: true, reachable: true, subscription: active })).toBe('active');
        expect(notisStatusFromChannelState({ configured: true, reachable: true, subscription: null })).toBeNull();
        expect(notisStatusFromChannelState({ configured: true, reachable: false, subscription: null })).toBe('unknown');
        expect(notisStatusFromChannelState({ configured: false, reachable: false, subscription: null })).toBeNull();
    });
});

describe('phoneChannelFor', () => {
    it('is what Notis says whenever Notis knows the reader', () => {
        expect(phoneChannelFor('active', false)).toBe(true);
        expect(phoneChannelFor('unsubscribed', true)).toBe(false);
    });

    it("is the reader's own request when Notis has not met them", () => {
        expect(phoneChannelFor(null, true)).toBe(true);
        expect(phoneChannelFor(null, false)).toBe(false);
    });

    it('is unknown while Notis does not answer, never a guess', () => {
        expect(phoneChannelFor('unknown', true)).toBeNull();
    });
});
