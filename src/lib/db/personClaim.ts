import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";

export type PersonClaimResult =
    | { status: "linked"; cityId: string; personName: string }
    /** This user already administers the person: a second scan of their own QR. */
    | { status: "already_yours" }
    /** Someone else already administers the person. Nothing is created. */
    | { status: "already_linked" }
    | { status: "not_found" };

export type PersonClaimStatus = PersonClaimResult["status"];

const SERIALIZATION_FAILURE = "P2034";

/**
 * Link `userId` to `personId` as its administrator, if nobody is yet.
 *
 * The check and the insert run in one serializable transaction, so two
 * people who scan the same QR at the same moment cannot both win: the loser
 * fails with P2034, and one retry then sees the winner's row.
 */
export async function claimPerson(userId: string, personId: string): Promise<PersonClaimResult> {
    const attempt = () =>
        prisma.$transaction(
            async (tx): Promise<PersonClaimResult> => {
                const person = await tx.person.findUnique({
                    where: { id: personId },
                    select: { cityId: true, name: true, administrators: { select: { userId: true } } },
                });
                if (!person) return { status: "not_found" };
                if (person.administrators.some((a) => a.userId === userId)) return { status: "already_yours" };
                if (person.administrators.length > 0) return { status: "already_linked" };

                await tx.administers.create({ data: { userId, personId } });
                return { status: "linked", cityId: person.cityId, personName: person.name };
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

    try {
        return await attempt();
    } catch (error) {
        if ((error as { code?: string }).code !== SERIALIZATION_FAILURE) throw error;
        return attempt();
    }
}

/**
 * Whether a person can still be claimed: it exists and nobody administers it.
 * A read ahead of sign-in only, so a scan of a spent code gets its answer
 * without an account; `claimPerson` decides again, in its transaction.
 */
export async function getClaimablePersonStatus(personId: string): Promise<"claimable" | "already_linked" | "not_found"> {
    const person = await prisma.person.findUnique({
        where: { id: personId },
        select: { _count: { select: { administrators: true } } },
    });
    if (!person) return "not_found";
    return person._count.administrators > 0 ? "already_linked" : "claimable";
}

/**
 * The persons of a city that already have an administrator: their QR would
 * be refused, so the sheet marks them instead. By city, so the sheet can ask
 * alongside its other queries instead of after them.
 */
export async function getClaimedPersonIds(cityId: string): Promise<Set<string>> {
    const rows = await prisma.administers.findMany({
        where: { personId: { not: null }, person: { cityId } },
        select: { personId: true },
    });
    return new Set(rows.map((r) => r.personId).filter((id): id is string => id !== null));
}
