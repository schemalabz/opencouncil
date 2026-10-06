// Server-only: proves that a key came from /api/upload/presigned-url. That
// route authorizes the upload and names the key, so set-acl trusts the key
// it issued and nothing the caller adds. HMAC over the key (domain-separated,
// keyed with NEXTAUTH_SECRET), the same pattern as the task callback token.
import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/env.mjs";

const DOMAIN = "upload-acl:";

export function mintUploadAclToken(key: string): string {
    return createHmac("sha256", env.NEXTAUTH_SECRET)
        .update(DOMAIN + key)
        .digest("hex");
}

export function verifyUploadAclToken(key: string, token: string): boolean {
    const expected = Buffer.from(mintUploadAclToken(key), "hex");
    const provided = Buffer.from(token, "hex");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
}
