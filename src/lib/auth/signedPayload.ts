import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/env.mjs";

/**
 * A payload that expires. `exp` is epoch milliseconds; a token whose payload
 * has passed it verifies as null.
 */
export interface ExpiringPayload {
    exp: number;
}

/**
 * The purpose a token was minted for. Every signer names one and every
 * verifier demands the same one, so a token printed on a QR sheet can never
 * pass as an unsubscribe link: same secret, same format, different kind.
 */
export type TokenKind = "unsubscribe" | "person-claim";

/**
 * `<base64url(json)>.<base64url(hmac)>`, signed with NEXTAUTH_SECRET. No
 * database row: the token is the state. Unsubscribe links and person claim
 * links use it.
 */
export function signPayload<T extends ExpiringPayload>(kind: TokenKind, data: T): string {
    const payload = Buffer.from(JSON.stringify({ ...data, kind })).toString("base64url");
    const signature = createHmac("sha256", env.NEXTAUTH_SECRET).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

/**
 * The payload of a token this deployment signed for `kind`, if it has not
 * expired; otherwise null. `allowUnkinded` accepts a token minted before the
 * kind existed; a caller that passes it must check the payload's own fields.
 */
export function verifyPayload<T extends ExpiringPayload>(
    kind: TokenKind,
    token: string,
    { allowUnkinded = false }: { allowUnkinded?: boolean } = {},
): T | null {
    try {
        const [payload, signature] = token.split(".");
        if (!payload || !signature) return null;

        const expected = createHmac("sha256", env.NEXTAUTH_SECRET).update(payload).digest("base64url");
        const sigBuf = new Uint8Array(Buffer.from(signature, "base64url"));
        const expectedBuf = new Uint8Array(Buffer.from(expected, "base64url"));
        if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

        const data: T & { kind?: unknown } = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
        if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
        if (data.kind !== kind && !(allowUnkinded && data.kind === undefined)) return null;
        return data;
    } catch {
        return null;
    }
}
