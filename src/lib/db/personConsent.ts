import "server-only";
import prisma from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "@/lib/api/errors";

/**
 * Record a person's voiceprint consent, as their own account gave it.
 *
 * Not `withUserAuthorizedToEdit`: that would let a superadmin or a city
 * admin tick the box for somebody else. Consent comes from the person, so
 * the caller must hold the Administers row that links them to the person.
 * The row is the consent; a withdrawal deletes it. A repeat tick keeps the
 * original time.
 */
export async function setVoicePrintConsent(personId: string, consent: boolean): Promise<void> {
    // A server action has no runtime types: a stale client once sent undefined.
    if (typeof consent !== "boolean") throw new BadRequestError("consent must be a boolean");
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError("Not signed in");
    if (!user.administers.some((a) => a.personId === personId)) {
        throw new ForbiddenError("Only the person's own account can give voiceprint consent");
    }

    if (consent) {
        await prisma.personVoicePrintConsent.upsert({ where: { personId }, create: { personId }, update: {} });
    } else {
        await prisma.personVoicePrintConsent.deleteMany({ where: { personId } });
    }
}

/** Which of `personIds` have given consent. */
export async function getVoicePrintConsentedIds(personIds: string[]): Promise<Set<string>> {
    if (personIds.length === 0) return new Set();
    const rows = await prisma.personVoicePrintConsent.findMany({
        where: { personId: { in: personIds } },
        select: { personId: true },
    });
    return new Set(rows.map((r) => r.personId));
}
