import type { ValidationIssue } from "@/lib/api/errors";

/**
 * One POST to /api/profile, shared by the personal details form and the
 * communication switches. The route validates a partial payload, so each
 * caller sends only the fields it owns.
 */
export type ProfileSaveResult =
    /** `phoneNeedsCode`: saved, except the number, which another account typed first and a code must prove. */
    | { ok: true; phoneNeedsCode: boolean }
    | { ok: false; code: string | null };

export async function postProfile(payload: object): Promise<ProfileSaveResult> {
    try {
        const response = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (response.ok) {
            const saved = (await response.json().catch(() => null)) as { phoneNeedsCode?: boolean } | null;
            return { ok: true, phoneNeedsCode: saved?.phoneNeedsCode === true };
        }
        // A 409 names the refusal in `error.code`. A 400 is a ValidationError,
        // and the message of a phone issue is a PHONE_REJECTION_CODES entry.
        const body = (await response.json().catch(() => null)) as {
            error?: { code?: string } | ValidationIssue[];
        } | null;
        const code = Array.isArray(body?.error)
            ? body.error.find(issue => issue.path[0] === "phone")?.message ?? null
            : body?.error?.code ?? null;
        // A code is a refusal the form can name (a phone another account holds).
        // Without one the server failed, and the console keeps the status.
        if (code === null) console.error("Failed to update profile:", response.status, body);
        return { ok: false, code };
    } catch (error) {
        console.error("Failed to update profile:", error);
        return { ok: false, code: null };
    }
}
