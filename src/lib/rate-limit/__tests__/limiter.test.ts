/** @jest-environment node */
import { claimAllowance } from "../limiter";
import type { Cap } from "../rules";

const mockIncr = jest.fn();
const mockConfigured = jest.fn();
const mockAlert = jest.fn();
const mockClaimAlertWindow = jest.fn();
jest.mock("@/lib/cache/valkey", () => ({
    cacheIncrWindow: (...args: unknown[]) => mockIncr(...args),
    isCacheConfigured: () => mockConfigured(),
}));
jest.mock("@/lib/cache/alertWindow", () => ({ claimAlertWindow: (...args: unknown[]) => mockClaimAlertWindow(...args) }));
jest.mock("@/lib/discord-core", () => ({ sendAdminAlert: (...args: unknown[]) => mockAlert(...args) }));

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
    for (const m of [mockIncr, mockConfigured, mockAlert, mockClaimAlertWindow]) m.mockReset();
    mockClaimAlertWindow.mockResolvedValue(true);
    jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("claimAllowance with Valkey", () => {
    beforeEach(() => mockConfigured.mockReturnValue(true));

    it("counts every cap and allows within them", async () => {
        mockIncr.mockResolvedValue({ count: 1, resetInMs: 1000 });
        const caps: Cap[] = [
            { name: "address", key: "a", max: 5, windowMs: 1000 },
            { name: "ip", key: "b", max: 30, windowMs: 1000 },
        ];
        expect(await claimAllowance("s", caps)).toEqual({ ok: true });
        expect(mockIncr).toHaveBeenCalledWith("a", 1000);
        expect(mockIncr).toHaveBeenCalledWith("b", 1000);
        expect(mockAlert).not.toHaveBeenCalled();
    });

    it("refuses past a cap and alerts once per window", async () => {
        mockIncr.mockResolvedValue({ count: 6, resetInMs: 30_000 });
        const cap: Cap = { name: "address", key: "a", max: 5, windowMs: 3_600_000 };
        expect(await claimAllowance("magic-link", [cap])).toEqual({ ok: false, cap, retryAfterMs: 30_000 });
        await flush();
        expect(mockClaimAlertWindow).toHaveBeenCalledWith("rate-limit:alert:magic-link:address", 3600);
        expect(mockAlert).toHaveBeenCalledTimes(1);
        expect(mockAlert.mock.calls[0][0].title).toContain("magic-link");

        mockClaimAlertWindow.mockResolvedValue(false);
        expect((await claimAllowance("magic-link", [cap])).ok).toBe(false);
        await flush();
        expect(mockAlert).toHaveBeenCalledTimes(1);
    });

    it("stops counting at the first cap that refuses", async () => {
        mockIncr.mockResolvedValueOnce({ count: 6, resetInMs: 1000 });
        const ip: Cap = { name: "ip", key: "ip", max: 5, windowMs: 1000 };
        const all: Cap = { name: "all", key: "all", max: 60, windowMs: 1000 };
        expect(await claimAllowance("contact-form", [ip, all])).toEqual({ ok: false, cap: ip, retryAfterMs: 1000 });
        expect(mockIncr).toHaveBeenCalledTimes(1);
        expect(mockIncr).not.toHaveBeenCalledWith("all", 1000);
    });

    it("lets the request through when Valkey does not answer, and alerts", async () => {
        mockIncr.mockResolvedValue("unavailable");
        expect(await claimAllowance("s", [{ name: "ip", key: "b", max: 1, windowMs: 1000 }])).toEqual({ ok: true });
        await flush();
        expect(mockClaimAlertWindow).toHaveBeenCalledWith("rate-limit:alert:degraded", 600);
        expect(mockAlert.mock.calls[0][0].title).toContain("degraded");
    });

    it("still refuses on the caps Valkey did count", async () => {
        mockIncr.mockResolvedValueOnce("unavailable").mockResolvedValueOnce({ count: 2, resetInMs: 500 });
        const counted: Cap = { name: "ip", key: "b", max: 1, windowMs: 1000 };
        const result = await claimAllowance("s", [{ name: "address", key: "a", max: 1, windowMs: 1000 }, counted]);
        expect(result).toEqual({ ok: false, cap: counted, retryAfterMs: 500 });
    });

    it("never throws when the alert does", async () => {
        mockIncr.mockResolvedValue({ count: 9, resetInMs: 1 });
        mockAlert.mockRejectedValue(new Error("discord down"));
        expect((await claimAllowance("s", [{ name: "ip", key: "b", max: 1, windowMs: 1000 }])).ok).toBe(false);
        await flush();
    });
});

describe("claimAllowance without CACHE_URL", () => {
    beforeEach(() => mockConfigured.mockReturnValue(false));

    it("counts in this process and refuses at the cap", async () => {
        const cap: Cap = { name: "ip", key: `memory:${Date.now()}`, max: 2, windowMs: 60_000 };
        expect(await claimAllowance("s", [cap])).toEqual({ ok: true });
        expect(await claimAllowance("s", [cap])).toEqual({ ok: true });
        const refused = await claimAllowance("s", [cap]);
        expect(refused.ok).toBe(false);
        if (!refused.ok) expect(refused.retryAfterMs).toBeLessThanOrEqual(60_000);
        expect(mockIncr).not.toHaveBeenCalled();
    });

    it("leaves room in the shared cap for others when one client is refused", async () => {
        const stamp = Date.now();
        const capsFor = (client: string): Cap[] => [
            { name: "ip", key: `memory:${stamp}:ip:${client}`, max: 2, windowMs: 60_000 },
            { name: "all", key: `memory:${stamp}:all`, max: 3, windowMs: 60_000 },
        ];
        for (let i = 0; i < 2; i++) expect(await claimAllowance("s", capsFor("noisy"))).toEqual({ ok: true });
        for (let i = 0; i < 20; i++) expect((await claimAllowance("s", capsFor("noisy"))).ok).toBe(false);
        expect(await claimAllowance("s", capsFor("other"))).toEqual({ ok: true });
        const full = await claimAllowance("s", capsFor("third"));
        expect(full.ok).toBe(false);
        if (!full.ok) expect(full.cap.name).toBe("all");
    });
});
