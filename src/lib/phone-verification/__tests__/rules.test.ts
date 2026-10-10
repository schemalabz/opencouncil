import {
    CODE_LENGTH,
    MAX_SENDS_PER_PHONE_PER_WINDOW,
    MAX_SENDS_PER_USER_PER_WINDOW,
    RESEND_COOLDOWN_MS,
    SEND_WINDOW_MS,
} from "../constants";
import { codeMatches, generateCode, hashCode, isExpired, sendAllowance, unusualCodeRequest } from "../rules";

const NOW = new Date("2026-09-28T10:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

describe("generateCode", () => {
    it("is CODE_LENGTH digits, leading zeros kept", () => {
        expect(generateCode(() => 42)).toBe("000042");
        expect(generateCode(() => 999999)).toBe("999999");
        expect(generateCode()).toMatch(new RegExp(`^\\d{${CODE_LENGTH}}$`));
    });
});

describe("hashCode / codeMatches", () => {
    it("matches only the same code under the same key", () => {
        const hash = hashCode("482913", "secret");
        expect(codeMatches("482913", hash, "secret")).toBe(true);
        expect(codeMatches("482914", hash, "secret")).toBe(false);
        expect(codeMatches("482913", hash, "other")).toBe(false);
        expect(codeMatches("482913", "not-hex", "secret")).toBe(false);
    });
});

describe("isExpired", () => {
    it("treats a missing expiry as expired, and the instant itself too", () => {
        expect(isExpired(null, NOW)).toBe(true);
        expect(isExpired(NOW, NOW)).toBe(true);
        expect(isExpired(at(1), NOW)).toBe(false);
    });
});

describe("sendAllowance", () => {
    const none = { userSends: [], phoneSends: [] };
    const times = (...offsets: number[]) => offsets.map(at);

    it("lets the first code go", () => {
        expect(sendAllowance(none, NOW)).toEqual({ ok: true });
    });

    it("makes a reader wait between two codes", () => {
        const history = { userSends: times(0), phoneSends: times(0) };
        expect(sendAllowance(history, at(RESEND_COOLDOWN_MS - 1))).toEqual({
            ok: false,
            reason: "too_soon",
            retryAfterMs: 1,
        });
        expect(sendAllowance(history, at(RESEND_COOLDOWN_MS))).toEqual({ ok: true });
    });

    it("caps an account per window, whatever numbers the codes went to", () => {
        // Three codes to three different numbers: switching numbers resets nothing.
        const history = { userSends: times(0, 60_000, 120_000), phoneSends: [] };
        expect(sendAllowance(history, at(600_000))).toEqual({
            ok: false,
            reason: "too_many",
            retryAfterMs: SEND_WINDOW_MS - 600_000,
        });
    });

    it("caps a number per window across accounts, and names the exact wait", () => {
        const phoneSends = times(0, 60_000, 120_000, 180_000, 240_000);
        const history = { userSends: [], phoneSends };
        expect(sendAllowance(history, at(3_300_000))).toEqual({
            ok: false,
            reason: "too_many",
            // The oldest of the five leaves the window 5 minutes from now.
            retryAfterMs: SEND_WINDOW_MS - 3_300_000,
        });
        expect(MAX_SENDS_PER_PHONE_PER_WINDOW).toBe(phoneSends.length);
    });

    it("forgets the codes that left the window", () => {
        const history = { userSends: times(0, 60_000, 120_000), phoneSends: times(0, 60_000, 120_000) };
        expect(sendAllowance(history, at(SEND_WINDOW_MS + 120_000))).toEqual({ ok: true });
        expect(MAX_SENDS_PER_USER_PER_WINDOW).toBe(3);
    });
});

describe('unusualCodeRequest', () => {
    const home = ['GR', 'RS', 'FR', 'CY'];

    it('says nothing about an ordinary request', () => {
        expect(unusualCodeRequest({ country: 'GR', phoneSendCount: 1 }, home)).toEqual([]);
        expect(unusualCodeRequest({ country: 'RS', phoneSendCount: 2 }, home)).toEqual([]);
    });

    it('flags a number outside the realm countries, or one it cannot place', () => {
        expect(unusualCodeRequest({ country: 'DE', phoneSendCount: 1 }, home)).toEqual([
            { kind: 'foreign', text: 'The number is outside the realm countries (DE).' },
        ]);
        expect(unusualCodeRequest({ country: null, phoneSendCount: 1 }, home)[0].text).toContain('unknown country');
    });

    it('flags the third code to one number and beyond, and the cap', () => {
        const kinds = (count: number) => unusualCodeRequest({ country: 'GR', phoneSendCount: count }, home).map((s) => s.kind);
        expect(kinds(3)).toEqual(['flood']);
        // A refused send may still sit in the count: the threshold is "at least".
        expect(kinds(4)).toEqual(['flood']);
        expect(kinds(5)).toEqual(['flood', 'cap']);
        expect(unusualCodeRequest({ country: 'GR', phoneSendCount: 5 }, home)[1].text).toBe(
            'The number reached its cap of 5 codes an hour.',
        );
    });
});
