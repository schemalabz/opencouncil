import "server-only";
import { Prisma, VoicePrintConsentSource } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { serializableOnce } from "@/lib/db/serializable";
import { getCurrentUser } from "@/lib/auth";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "@/lib/api/errors";

const openPeriod = (personId: string) => ({ personId, withdrawnAt: null });
const openPeriodSelect = { id: true, source: true, givenAt: true } satisfies Prisma.VoicePrintConsentSelect;
type OpenPeriod = Prisma.VoicePrintConsentGetPayload<{ select: typeof openPeriodSelect }>;

/**
 * Both writers go through `serializableOnce`, so a grant and a withdrawal in
 * flight together cannot both commit; the one that commits last is the state
 * recorded. Only a grant creates a row, so a conflict on the open-period
 * index means that a concurrent grant opened the period: a consent is in
 * force, as asked.
 */
const writeConsent = (work: (tx: Prisma.TransactionClient) => Promise<void>) => serializableOnce(work, () => undefined);

/**
 * Close a period, never before it started. The grant and the withdrawal can
 * run on two instances, and the check constraint refuses a withdrawal time
 * before the grant time: a clock that is behind must not block a withdrawal.
 */
const closePeriod = (tx: Prisma.TransactionClient, period: OpenPeriod) =>
    tx.voicePrintConsent.update({
        where: { id: period.id },
        data: { withdrawnAt: new Date(Math.max(Date.now(), period.givenAt.getTime())) },
    });

/**
 * Set a person's voiceprint consent from the profile of an account that
 * administers the person: the person's own account, by a QR claim, or an
 * account a superadmin gave the person to. The consent is the person's, not
 * the account's, so every such account sees and changes the same state.
 *
 * Not `withUserAuthorizedToEdit`: that would let a superadmin, or a city
 * admin, tick the box for a person they were never given. The caller must
 * hold an Administers row for the person.
 *
 * A consent is a period. A tick opens one, under this account, and a tick
 * on an open period keeps it, so the original time stands. A withdrawal
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
    const refused = () => new ForbiddenError("Only an account that administers the person can set its voiceprint consent");
    if (!user.administers.some((a) => a.personId === personId)) throw refused();

    await writeConsent(async (tx) => {
        // Read inside the write: a permission removed meanwhile refuses it.
        const row = await tx.administers.findFirst({ where: { userId: user.id, personId }, select: { id: true } });
        if (!row) throw refused();

        const open = await tx.voicePrintConsent.findFirst({ where: openPeriod(personId), select: openPeriodSelect });
        if (open?.source === VoicePrintConsentSource.ADMIN) {
            if (consent) return;
            throw new ForbiddenError("A consent that OpenCouncil recorded is withdrawn by email");
        }
        if (consent) {
            if (!open) await tx.voicePrintConsent.create({ data: { personId, userId: user.id } });
            return;
        }
        if (open) await closePeriod(tx, open);
    });
}

/**
 * Record, as a superadmin, a consent that the person gave on paper, or
 * withdraw the one in force on the person's request. The person does not
 * need an account. A grant keeps a period that is in force as it is, so the
 * original time stands. A withdrawal closes the open period, whoever opened
 * it.
 */
export async function recordVoicePrintConsent(personId: string, consent: boolean): Promise<void> {
    if (typeof consent !== "boolean") throw new BadRequestError("consent must be a boolean");
    const user = await getCurrentUser();
    if (!user) throw new UnauthorizedError("Not signed in");
    if (!user.isSuperAdmin) throw new ForbiddenError("Only a superadmin can record a voiceprint consent");

    await writeConsent(async (tx) => {
        const open = await tx.voicePrintConsent.findFirst({ where: openPeriod(personId), select: openPeriodSelect });
        if (consent) {
            if (!open) {
                await tx.voicePrintConsent.create({ data: { personId, userId: user.id, source: VoicePrintConsentSource.ADMIN } });
            }
            return;
        }
        if (open) await closePeriod(tx, open);
    });
}

/**
 * The consent in force for each of `personIds`: PERSON for a period that an
 * account of the person opened, ADMIN for a period that a superadmin
 * recorded. A person with no open period has no entry.
 */
export async function getVoicePrintConsents(personIds: string[]): Promise<Map<string, VoicePrintConsentSource>> {
    if (personIds.length === 0) return new Map();
    const rows = await prisma.voicePrintConsent.findMany({
        where: { personId: { in: personIds }, withdrawnAt: null },
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

/** The consent in force for a person, with the account that gave it, for a superadmin. Null when none is. */
export async function getVoicePrintConsentStatus(personId: string): Promise<VoicePrintConsentStatus | null> {
    return prisma.voicePrintConsent.findFirst({ where: openPeriod(personId), select: consentStatusSelect });
}
