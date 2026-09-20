/**
 * One POST to /api/profile, shared by the personal details form and the
 * communication switches. The route validates a partial payload, so each
 * caller sends only the fields it owns.
 */
export type ProfileSaveResult = { ok: true } | { ok: false; code: string | null };

export async function postProfile(payload: object): Promise<ProfileSaveResult> {
    try {
        const response = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (response.ok) return { ok: true };
        const body = (await response.json().catch(() => null)) as {
            error?: { code?: string; fieldErrors?: { phone?: string[] } };
        } | null;
        const code = body?.error?.code ?? body?.error?.fieldErrors?.phone?.[0] ?? null;
        // A code is a refusal the form can name (a phone another account holds).
        // Without one the server failed, and the console keeps the status.
        if (code === null) console.error("Failed to update profile:", response.status, body);
        return { ok: false, code };
    } catch (error) {
        console.error("Failed to update profile:", error);
        return { ok: false, code: null };
    }
}
