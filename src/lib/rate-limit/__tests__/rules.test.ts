import { allowance, clientIp, hashIdentifier, MemoryWindows, type Cap } from "../rules";

const address: Cap = { name: "address", key: "k:address", max: 5, windowMs: 3_600_000 };
const ip: Cap = { name: "ip", key: "k:ip", max: 30, windowMs: 3_600_000 };

describe("allowance", () => {
    it("allows while every count is within its cap, the cap itself included", () => {
        expect(allowance([{ cap: address, count: 5, resetInMs: 1000 }, { cap: ip, count: 1, resetInMs: 1000 }])).toEqual({ ok: true });
        expect(allowance([])).toEqual({ ok: true });
    });

    it("refuses the first count past its cap, with the time left in its window", () => {
        expect(allowance([{ cap: address, count: 6, resetInMs: 42_000 }, { cap: ip, count: 2, resetInMs: 1000 }])).toEqual({
            ok: false,
            cap: address,
            retryAfterMs: 42_000,
        });
    });

    it("names the longest wait when more than one cap is full", () => {
        const result = allowance([{ cap: address, count: 6, resetInMs: 10_000 }, { cap: ip, count: 31, resetInMs: 50_000 }]);
        expect(result).toEqual({ ok: false, cap: ip, retryAfterMs: 50_000 });
    });

    it("never names a zero wait", () => {
        expect(allowance([{ cap: address, count: 6, resetInMs: 0 }])).toEqual({ ok: false, cap: address, retryAfterMs: 1 });
    });
});

describe("clientIp", () => {
    it("takes App Platform's do-connecting-ip over x-forwarded-for", () => {
        const headers = new Headers({ "do-connecting-ip": "203.0.113.9", "x-forwarded-for": "10.0.0.1" });
        expect(clientIp(headers)).toBe("203.0.113.9");
    });

    it("takes the last x-forwarded-for entry, the one the proxy appended", () => {
        expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
        expect(clientIp(new Headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    });

    it("is null without a proxy header, and for a value that is not an address", () => {
        expect(clientIp(new Headers())).toBeNull();
        expect(clientIp(new Headers({ "x-forwarded-for": "" }))).toBeNull();
        expect(clientIp(new Headers({ "do-connecting-ip": "not an ip" }))).toBeNull();
        expect(clientIp(new Headers({ "x-forwarded-for": "a".repeat(60) }))).toBeNull();
    });
});

describe("hashIdentifier", () => {
    it("is one key per address, whatever the case and spacing", () => {
        expect(hashIdentifier("s", "Anna@Example.com ")).toBe(hashIdentifier("s", "anna@example.com"));
        expect(hashIdentifier("s", "anna@example.com")).not.toBe(hashIdentifier("s", "anna@example.org"));
        expect(hashIdentifier("s", "anna@example.com")).not.toBe(hashIdentifier("t", "anna@example.com"));
        expect(hashIdentifier("s", "anna@example.com")).not.toContain("anna");
    });
});

describe("MemoryWindows", () => {
    it("counts a fixed window from the first hit and starts over after it", () => {
        const windows = new MemoryWindows();
        expect(windows.hit("k", 1000, 0)).toEqual({ count: 1, resetInMs: 1000 });
        expect(windows.hit("k", 1000, 400)).toEqual({ count: 2, resetInMs: 600 });
        expect(windows.hit("k", 1000, 999)).toEqual({ count: 3, resetInMs: 1 });
        expect(windows.hit("k", 1000, 1000)).toEqual({ count: 1, resetInMs: 1000 });
    });

    it("keeps keys apart", () => {
        const windows = new MemoryWindows();
        windows.hit("a", 1000, 0);
        expect(windows.hit("b", 1000, 0)).toEqual({ count: 1, resetInMs: 1000 });
    });

    it("sweeps expired keys once it holds many", () => {
        const windows = new MemoryWindows();
        for (let i = 0; i < 10_000; i++) windows.hit(`k${i}`, 1000, 0);
        expect(windows.size).toBe(10_000);
        windows.hit("fresh", 1000, 1000);
        expect(windows.size).toBe(1);
    });
});
