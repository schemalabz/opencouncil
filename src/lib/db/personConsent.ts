import "server-only";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "@/lib/api/errors";

const OPEN_PERIOD_TAKEN = "P2002";

/**
 * Record a person's voiceprint consent, as their own account gave it.
 *
 * Not `withUserAuthorizedToEdit`: that would let a superadmin or a city
 * admin tick the box for somebody else. Consent comes from the person, so
 * the caller must hold the *claimed* Administers row for the person, the one
 * a QR scan sets. A delegate row a superadmin added does not count.
 *
 * A consent is a period. A tick opens one, under this account. A withdrawal
 * closes every open period of the person and deletes nothing, so we can
 * still show that consent was in force while a voiceprint was processed.
 */
export async function setVoicePrintConsent(personId: string, consent: boolean): Promise<void> {
    // A server action has no runtime types: a stale client once sent undefined.
    if (typeof consent !== "boolean") throw new BadRequestError("consent must be a boolean");
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError("Not signed in");
    if (!user.administers.some((a) => a.personId === personId && a.claimedAt)) {
        throw new ForbiddenError("Only the account that claimed the person can give voiceprint consent");
    }

    if (!consent) {
        await prisma.voicePrintConsent.updateMany({
            where: { personId, withdrawnAt: null },
            data: { withdrawnAt: new Date() },
        });
        return;
    }

    try {
        await prisma.$transaction(async (tx) => {
            // A period open under another account is stale: that account was
            // the person once, and this one is now. Close it, so the open
            // period is always the current account's own.
            await tx.voicePrintConsent.updateMany({
                where: { personId, withdrawnAt: null, NOT: { userId: user.id } },
                data: { withdrawnAt: new Date() },
            });
            const open = await tx.voicePrintConsent.findFirst({ where: { personId, withdrawnAt: null }, select: { id: true } });
            if (!open) await tx.voicePrintConsent.create({ data: { personId, userId: user.id } });
        });
    } catch (error) {
        // Two ticks at once: the unique index let one through, and that one
        // is this account's period. Nothing is missing.
        if ((error as { code?: string }).code !== OPEN_PERIOD_TAKEN) throw error;
    }
}

/**
 * Which of `personIds` have an open consent period given by `userId`. A
 * period another account opened does not show as this account's tick: the
 * person may have been relinked, and the new account never consented.
 */
export async function getVoicePrintConsentedIds(personIds: string[], userId: string): Promise<Set<string>> {
    if (personIds.length === 0) return new Set();
    const rows = await prisma.voicePrintConsent.findMany({
        where: { personId: { in: personIds }, userId, withdrawnAt: null },
        select: { personId: true },
    });
    return new Set(rows.map((r) => r.personId));
}
