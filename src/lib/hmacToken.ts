// Server-only: a token that proves the server issued a value, without a table.
// HMAC over the value, domain-separated so that a token for one purpose never
// verifies for another, keyed with NEXTAUTH_SECRET.
import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/env.mjs";

export function mintHmacToken(domain: string, value: string): string {
    return createHmac("sha256", env.NEXTAUTH_SECRET)
        .update(domain + value)
        .digest("hex");
}

export function verifyHmacToken(domain: string, value: string, token: string): boolean {
    const expected = Buffer.from(mintHmacToken(domain, value), "hex");
    const provided = Buffer.from(token, "hex");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
}
