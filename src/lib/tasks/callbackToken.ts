// Server-only: authenticates task-server callbacks. startTask mints the token
// into the callbackUrl it hands the task server; the task server treats that
// URL as opaque and posts back to it verbatim, so the token round-trips with
// no task-server changes. HMAC over the task id (domain-separated, keyed with
// NEXTAUTH_SECRET) means no schema change and nothing new to configure.
import "server-only";
import { mintHmacToken, verifyHmacToken } from "@/lib/hmacToken";

const DOMAIN = "task-callback:";

export function mintCallbackToken(taskStatusId: string): string {
    return mintHmacToken(DOMAIN, taskStatusId);
}

export function verifyCallbackToken(taskStatusId: string, token: string): boolean {
    return verifyHmacToken(DOMAIN, taskStatusId, token);
}
