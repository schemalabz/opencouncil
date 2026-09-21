import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";
import { serializableOnce } from "@/lib/db/serializable";
import { closeAppConsent } from "@/lib/db/personConsent";
import { getActiveRoleCondition } from "@/lib/utils/roles";

export type PersonClaimResult =
    | { status: "linked"; cityId: string; cityName: string; personName: string }
    /** This user already claimed the person: a second scan of their own QR. */
    | { status: "already_yours" }
    /** Another account already claimed the person. Nothing is created. */
    | { status: "already_linked" }
    | { status: "not_found" };

export type PersonClaimStatus = PersonClaimResult["status"];

/**
 * Make `userId` the account that is `personId`: an Administers row with
 * claimedAt set. A row without claimedAt is a delegate a superadmin added;
 * it does not block a claim, and the person's own scan turns it into the
 * claimed row.
 *
 * The claim also completes the account: the scanner confirmed the name in
 * the join flow, so an account without a name takes the person's, and the
 * account counts as onboarded. A councillor must not meet a second
 * registration form after the flow told them they are done.
 *
 * The claim closes a consent that an earlier account gave in the app. The
 * flow asks the question next, and the person answers for themselves. A
 * consent recorded on paper stays, and the flow skips the question.
 *
 * The check and the write run through `serializableOnce`, so two people who
 * scan the same QR at the same moment cannot both win. The partial unique
 * index on claimed rows is the backstop: a conflict on it means that a claim
 * was written meanwhile, by another account or by a second submit of this one.
 */
export async function claimPerson(userId: string, personId: string): Promise<PersonClaimResult> {
    return serializableOnce<PersonClaimResult>(
        async (tx) => {
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
            await closeAppConsent(tx, personId);
            const account = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
            await tx.user.update({
                where: { id: userId },
                data: { onboarded: true, ...(account?.name ? {} : { name: person.name }) },
            });
            return { status: "linked", cityId: person.cityId, cityName: person.city.name, personName: person.name };
        },
        async () => {
            const claimed = await prisma.administers.findFirst({
                where: { personId, claimedAt: { not: null } },
                select: { userId: true },
            });
            return { status: claimed?.userId === userId ? "already_yours" : "already_linked" };
        },
    );
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

const joinPersonSelect = {
    id: true,
    name: true,
    image: true,
    cityId: true,
    city: { select: { name: true, supportsNotifications: true } },
    roles: {
        where: { OR: getActiveRoleCondition() },
        select: {
            name: true,
            cityId: true,
            partyId: true,
            administrativeBodyId: true,
            administrativeBody: { select: { type: true } },
        },
    },
    administrators: { where: { claimedAt: { not: null } }, select: { userId: true } },
} satisfies Prisma.PersonSelect;

export type JoinPerson = Prisma.PersonGetPayload<{ select: typeof joinPersonSelect }>;

/** What the join flow shows of a person, and who has claimed them, if anyone. */
export async function getJoinPerson(personId: string): Promise<JoinPerson | null> {
    return prisma.person.findUnique({ where: { id: personId }, select: joinPersonSelect });
}
