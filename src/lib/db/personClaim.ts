import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";

export type PersonClaimResult =
    | { status: "linked"; cityId: string; cityName: string; personName: string }
    /** This user already claimed the person: a second scan of their own QR. */
    | { status: "already_yours" }
    /** Another account already claimed the person. Nothing is created. */
    | { status: "already_linked" }
    | { status: "not_found" };

export type PersonClaimStatus = PersonClaimResult["status"];

const SERIALIZATION_FAILURE = "P2034";
const CLAIMED_ROW_TAKEN = "P2002";

/**
 * Make `userId` the account that is `personId`: an Administers row with
 * claimedAt set. A row without claimedAt is a delegate a superadmin added;
 * it does not block a claim, and the person's own scan turns it into the
 * claimed row.
 *
 * The check and the write run in one serializable transaction, so two
 * people who scan the same QR at the same moment cannot both win: the loser
 * fails with P2034, and one retry then sees the winner's row. The partial
 * unique index on claimed rows is the backstop; a P2002 from it is the same
 * answer.
 */
export async function claimPerson(userId: string, personId: string): Promise<PersonClaimResult> {
    const attempt = () =>
        prisma.$transaction(
            async (tx): Promise<PersonClaimResult> => {
                const person = await tx.person.findUnique({
                    where: { id: personId },
                    select: {
                        cityId: true,
                        name: true,
                        city: { select: { name: true } },
                        administrators: { select: { id: true, userId: true, claimedAt: true } },
                    },
                });
                if (!person) return { status: "not_found" };
                const claimed = person.administrators.find((a) => a.claimedAt);
                if (claimed) return { status: claimed.userId === userId ? "already_yours" : "already_linked" };

                const own = person.administrators.find((a) => a.userId === userId);
                if (own) {
                    await tx.administers.update({ where: { id: own.id }, data: { claimedAt: new Date() } });
                } else {
                    await tx.administers.create({ data: { userId, personId, claimedAt: new Date() } });
                }
                return { status: "linked", cityId: person.cityId, cityName: person.city.name, personName: person.name };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

    try {
        return await attempt();
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === CLAIMED_ROW_TAKEN) return { status: "already_linked" };
        if (code !== SERIALIZATION_FAILURE) throw error;
        return attempt();
    }
}

/**
 * Whether a person can still be claimed: it exists and no account has
 * claimed it. A read ahead of sign-in only, so a scan of a spent code gets
 * its answer without an account; `claimPerson` decides again, in its
 * transaction.
 */
export async function getClaimablePersonStatus(personId: string): Promise<"claimable" | "already_linked" | "not_found"> {
    const person = await prisma.person.findUnique({
        where: { id: personId },
        select: { _count: { select: { administrators: { where: { claimedAt: { not: null } } } } } },
    });
    if (!person) return "not_found";
    return person._count.administrators > 0 ? "already_linked" : "claimable";
}

/**
 * The persons of a city that an account has claimed: their QR would be
 * refused, so the sheet leaves them out. Delegate rows do not count, so a
 * councillor with an assistant still gets a strip. By city, so the sheet can
 * ask alongside its other queries instead of after them.
 */
export async function getClaimedPersonIds(cityId: string): Promise<Set<string>> {
    const rows = await prisma.administers.findMany({
        where: { personId: { not: null }, claimedAt: { not: null }, person: { cityId } },
        select: { personId: true },
    });
    return new Set(rows.map((r) => r.personId).filter((id): id is string => id !== null));
}
