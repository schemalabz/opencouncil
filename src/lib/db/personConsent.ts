import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "@/lib/api/errors";

const OPEN_PERIOD_TAKEN = "P2002";
const SERIALIZATION_FAILURE = "P2034";

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
    const refused = () => new ForbiddenError("Only the account that claimed the person can give voiceprint consent");
    if (!user.administers.some((a) => a.personId === personId && a.claimedAt)) throw refused();

    // Serializable, with the claim read inside: a claim removed meanwhile
    // refuses the write, and a grant and a withdrawal in flight together
    // cannot both commit; the one that commits last is the state recorded.
    const write = () =>
        prisma.$transaction(
            async (tx) => {
                const claimed = await tx.administers.findFirst({
                    where: { userId: user.id, personId, claimedAt: { not: null } },
                    select: { id: true },
                });
                if (!claimed) throw refused();

                if (!consent) {
                    await tx.voicePrintConsent.updateMany({
                        where: { personId, withdrawnAt: null },
                        data: { withdrawnAt: new Date() },
                    });
                    return;
                }
                // A period open under another account is stale: that account was
                // the person once, and this one is now. Close it, so the open
                // period is always the current account's own. A deleted account
                // leaves its period with no user; to SQL, NULL is not "another
                // user", so it is named on its own.
                await tx.voicePrintConsent.updateMany({
                    where: { personId, withdrawnAt: null, OR: [{ userId: null }, { userId: { not: user.id } }] },
                    data: { withdrawnAt: new Date() },
                });
                const open = await tx.voicePrintConsent.findFirst({ where: { personId, withdrawnAt: null }, select: { id: true } });
                if (!open) await tx.voicePrintConsent.create({ data: { personId, userId: user.id } });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

    try {
        await write();
    } catch (error) {
        const code = (error as { code?: string }).code;
        // Two grants at once: the unique index let one through, and it is
        // this account's period. Nothing is missing.
        if (code === OPEN_PERIOD_TAKEN) return;
        if (code !== SERIALIZATION_FAILURE) throw error;
        await write();
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
