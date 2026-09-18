import "server-only";
import { Prisma, VoicePrintConsentSource } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { serializableOnce } from "@/lib/db/serializable";
import { getCurrentUser } from "@/lib/auth";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "@/lib/api/errors";

const openPeriod = (personId: string) => ({ personId, withdrawnAt: null });
const claimedRow = (personId: string) => ({ personId, claimedAt: { not: null } });

/**
 * Both writers go through `serializableOnce`, so a grant and a withdrawal in
 * flight together cannot both commit; the one that commits last is the state
 * recorded. Only a grant creates a row, so a conflict on the open-period
 * index means that a concurrent grant opened the period: a consent is in
 * force, as asked.
 */
const writeConsent = (work: (tx: Prisma.TransactionClient) => Promise<void>) => serializableOnce(work, () => undefined);

const closePeriod = (tx: Prisma.TransactionClient, id: string) =>
    tx.voicePrintConsent.update({ where: { id }, data: { withdrawnAt: new Date() } });

/**
 * A PERSON period belongs to the account that opened it. When that account
 * is deleted, or the person is claimed by another account, the period is
 * stale: the account that is the person now never consented. An ADMIN period
 * is the person's, whatever account they hold, so it is never stale.
 */
function isStale(
    period: { source: VoicePrintConsentSource; userId: string | null },
    claimantUserId: string | null,
): boolean {
    return period.source === VoicePrintConsentSource.PERSON && period.userId !== claimantUserId;
}

/**
 * Record a person's voiceprint consent, as their own account gave it.
 *
 * Not `withUserAuthorizedToEdit`: that would let a superadmin or a city
 * admin tick the box for somebody else. Consent comes from the person, so
 * the caller must hold the *claimed* Administers row for the person, the one
 * a QR scan sets. A delegate row a superadmin added does not count.
 *
 * A consent is a period. A tick opens one, under this account. A withdrawal
 * closes the open period and deletes nothing, so we can still show that
 * consent was in force while a voiceprint was processed.
 *
 * A period that a superadmin recorded is not the account's to close: the
 * person revokes it by email. A tick on it changes nothing.
 */
export async function setVoicePrintConsent(personId: string, consent: boolean): Promise<void> {
    // A server action has no runtime types: a stale client once sent undefined.
    if (typeof consent !== "boolean") throw new BadRequestError("consent must be a boolean");
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError("Not signed in");
    const refused = () => new ForbiddenError("Only the account that claimed the person can give voiceprint consent");
    if (!user.administers.some((a) => a.personId === personId && a.claimedAt)) throw refused();

    await writeConsent(async (tx) => {
        // Read inside the write: a claim removed meanwhile refuses it.
        const claimed = await tx.administers.findFirst({
            where: { userId: user.id, ...claimedRow(personId) },
            select: { id: true },
        });
        if (!claimed) throw refused();

        const open = await tx.voicePrintConsent.findFirst({
            where: openPeriod(personId),
            select: { id: true, userId: true, source: true },
        });
        if (open?.source === VoicePrintConsentSource.ADMIN) {
            if (consent) return;
            throw new ForbiddenError("A consent that OpenCouncil recorded is withdrawn by email");
        }
        if (!consent) {
            if (open) await closePeriod(tx, open.id);
            return;
        }
        if (open && !isStale(open, user.id)) return;
        // Close a stale period, so the open period is always the current
        // account's own.
        if (open) await closePeriod(tx, open.id);
        await tx.voicePrintConsent.create({ data: { personId, userId: user.id } });
    });
}

/**
 * Record, as a superadmin, a consent that the person gave outside the app,
 * or withdraw one on the person's request. The person does not need an
 * account. A grant keeps a period that is in force as it is, so the original
 * time stands, and replaces a stale one. A withdrawal closes the open
 * period, whoever opened it.
 */
export async function recordVoicePrintConsent(personId: string, consent: boolean): Promise<void> {
    if (typeof consent !== "boolean") throw new BadRequestError("consent must be a boolean");
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError("Not signed in");
    if (!user.isSuperAdmin) throw new ForbiddenError("Only a superadmin can record a voiceprint consent");

    await writeConsent(async (tx) => {
        const open = await tx.voicePrintConsent.findFirst({
            where: openPeriod(personId),
            select: { id: true, userId: true, source: true },
        });
        if (!consent) {
            if (open) await closePeriod(tx, open.id);
            return;
        }
        if (open) {
            const claimant = await tx.administers.findFirst({ where: claimedRow(personId), select: { userId: true } });
            if (!isStale(open, claimant?.userId ?? null)) return;
            await closePeriod(tx, open.id);
        }
        await tx.voicePrintConsent.create({ data: { personId, userId: user.id, source: VoicePrintConsentSource.ADMIN } });
    });
}

/**
 * The consent in force for each of `personIds`, as the account `userId`
 * sees it: PERSON for a period that this account opened, ADMIN for a period
 * that a superadmin recorded. A period that another account opened does not
 * show: the person may have been relinked, and the new account never
 * consented.
 */
export async function getVoicePrintConsents(
    personIds: string[],
    userId: string,
): Promise<Map<string, VoicePrintConsentSource>> {
    if (personIds.length === 0) return new Map();
    const rows = await prisma.voicePrintConsent.findMany({
        where: {
            personId: { in: personIds },
            withdrawnAt: null,
            OR: [{ source: VoicePrintConsentSource.PERSON, userId }, { source: VoicePrintConsentSource.ADMIN }],
        },
        select: { personId: true, source: true },
    });
    return new Map(rows.map((r) => [r.personId, r.source]));
}

const consentStatusSelect = {
    userId: true,
    source: true,
    givenAt: true,
    user: { select: { name: true, email: true } },
} satisfies Prisma.VoicePrintConsentSelect;

export type VoicePrintConsentStatus = Prisma.VoicePrintConsentGetPayload<{ select: typeof consentStatusSelect }>;

/**
 * The consent in force for a person, for a superadmin. Null when none is: no
 * open period, or a stale one, which the person's own account does not see
 * either.
 */
export async function getVoicePrintConsentStatus(personId: string): Promise<VoicePrintConsentStatus | null> {
    const [open, claimant] = await Promise.all([
        prisma.voicePrintConsent.findFirst({ where: openPeriod(personId), select: consentStatusSelect }),
        prisma.administers.findFirst({ where: claimedRow(personId), select: { userId: true } }),
    ]);
    if (!open || isStale(open, claimant?.userId ?? null)) return null;
    return open;
}
