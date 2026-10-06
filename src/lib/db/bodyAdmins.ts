import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from "../auth";
import { BadRequestError, NotFoundError } from "@/lib/api/errors";
import { sendInviteEmail } from "@/lib/auth/invite";

/**
 * The admins of one administrative body (#828): the accounts that hold an
 * `Administers` row on the body. An admin of the body manages this list, so a
 * secretary adds a colleague without a superadmin. A superadmin or a city
 * admin creates the first one.
 */

const bodyAdminSelect = {
    createdAt: true,
    user: { select: { id: true, email: true, name: true, onboarded: true } },
} satisfies Prisma.AdministersSelect;

type BodyAdminRow = Prisma.AdministersGetPayload<{ select: typeof bodyAdminSelect }>;

function toBodyAdmin(row: BodyAdminRow) {
    return {
        userId: row.user.id,
        email: row.user.email,
        name: row.user.name,
        onboarded: row.user.onboarded,
        since: row.createdAt,
    };
}

export type BodyAdmin = ReturnType<typeof toBodyAdmin>;

/**
 * How many admins one body may have. Each invite of an unknown email creates
 * an account and sends an email, so a body admin cannot fan that out.
 */
const MAX_ADMINS_PER_BODY = 20;

async function requireBody(cityId: string, bodyId: string): Promise<void> {
    await withUserAuthorizedToEdit({ cityId, administrativeBodyId: bodyId });
    const body = await prisma.administrativeBody.findUnique({ where: { id: bodyId }, select: { cityId: true } });
    if (!body || body.cityId !== cityId) throw new NotFoundError("Administrative body not found");
}

export async function listBodyAdmins(cityId: string, bodyId: string): Promise<BodyAdmin[]> {
    await requireBody(cityId, bodyId);
    const rows = await prisma.administers.findMany({
        where: { administrativeBodyId: bodyId },
        select: bodyAdminSelect,
        orderBy: { createdAt: 'asc' },
    });
    return rows.map(toBodyAdmin);
}

/**
 * Give an account admin rights on the body. An unknown email gets a new
 * account and an invite email with a sign-in link, like the superadmin's
 * user tool sends. A known account only gets the row; it signs in as before.
 */
export async function addBodyAdmin(
    cityId: string,
    bodyId: string,
    { email, name }: { email: string; name?: string | null },
    request?: Request,
): Promise<{ admin: BodyAdmin; created: boolean; inviteEmailSent: boolean }> {
    await requireBody(cityId, bodyId);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new BadRequestError("Email cannot be empty");

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (!existing && await prisma.administers.count({ where: { administrativeBodyId: bodyId } }) >= MAX_ADMINS_PER_BODY) {
        throw new BadRequestError(`A body has at most ${MAX_ADMINS_PER_BODY} admins`);
    }
    // Two invites of one new email at once: the second create fails on the
    // unique email, and that request reads the account the first one made.
    const user = existing ?? await prisma.user.create({
        data: { email: normalizedEmail, name: name?.trim() || null },
        select: { id: true },
    }).catch(async (error: unknown) => {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        const raced = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
        if (!raced) throw error;
        return raced;
    });

    // Not an upsert: the other columns of the unique key are NULL here, and
    // Postgres never matches a NULL. A partial unique index on (userId,
    // administrativeBodyId) rejects the second of two concurrent invites,
    // which then reads the row the first one wrote.
    const findRow = () => prisma.administers.findFirst({
        where: { userId: user.id, administrativeBodyId: bodyId },
        select: bodyAdminSelect,
    });
    let row = await findRow();
    if (!row) {
        try {
            row = await prisma.administers.create({
                data: { userId: user.id, administrativeBodyId: bodyId },
                select: bodyAdminSelect,
            });
        } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
            row = await findRow();
            if (!row) throw error;
        }
    }

    const inviteEmailSent = existing ? false : await sendInviteEmail(normalizedEmail, name, request);

    return {
        admin: toBodyAdmin(row),
        created: !existing,
        inviteEmailSent,
    };
}

/**
 * Take the body away from an account. The account stays, with whatever else
 * it administers. The last admin of a body can be removed only by a city
 * admin or a superadmin: a body admin cannot lock the body's own door.
 */
export async function removeBodyAdmin(cityId: string, bodyId: string, userId: string): Promise<void> {
    await requireBody(cityId, bodyId);
    const mayRemoveLast = await isUserAuthorizedToEdit({ cityId });

    await prisma.$transaction(async (tx) => {
        // Lock the body row: two admins who remove each other at once must not
        // both read two admins and leave none.
        await tx.$queryRaw`SELECT id FROM "AdministrativeBody" WHERE id = ${bodyId} FOR UPDATE`;
        const rows = await tx.administers.findMany({
            where: { administrativeBodyId: bodyId },
            select: { id: true, userId: true },
        });
        const target = rows.find(row => row.userId === userId);
        if (!target) throw new NotFoundError("This account does not administer the body");

        if (rows.length === 1 && !mayRemoveLast) {
            throw new BadRequestError("The body needs at least one admin");
        }

        await tx.administers.delete({ where: { id: target.id } });
    });
}
