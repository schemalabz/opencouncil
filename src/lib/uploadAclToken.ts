// Server-only: proves that a key came from /api/upload/presigned-url. That
// route authorizes the upload and names the key, so set-acl trusts the key
// it issued and nothing the caller adds.
import "server-only";
import { mintHmacToken, verifyHmacToken } from "@/lib/hmacToken";

const DOMAIN = "upload-acl:";

export function mintUploadAclToken(key: string): string {
    return mintHmacToken(DOMAIN, key);
}

export function verifyUploadAclToken(key: string, token: string): boolean {
    return verifyHmacToken(DOMAIN, key, token);
}
