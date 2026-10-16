import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import { isUserAuthorizedToEdit, withUserAuthorizedToEdit } from "@/lib/auth";
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

    // One transaction per invite, holding the body row: the count, the
    // account and the admin row are read and written under the same lock, so
    // concurrent invites to one body run one after the other and the cap holds.
    const grant = () => prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "AdministrativeBody" WHERE id = ${bodyId} FOR UPDATE`;
        const existing = await tx.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
        const held = existing && await tx.administers.findFirst({
            where: { userId: existing.id, administrativeBodyId: bodyId },
            select: bodyAdminSelect,
        });
        if (held) return { row: held, created: false };

        if (await tx.administers.count({ where: { administrativeBodyId: bodyId } }) >= MAX_ADMINS_PER_BODY) {
            throw new BadRequestError(`A body has at most ${MAX_ADMINS_PER_BODY} admins`);
        }
        const user = existing ?? await tx.user.create({
            data: { email: normalizedEmail, name: name?.trim() || null },
            select: { id: true },
        });
        const row = await tx.administers.create({
            data: { userId: user.id, administrativeBodyId: bodyId },
            select: bodyAdminSelect,
        });
        return { row, created: !existing };
    });

    // The lock serializes invites to one body only. The same new email invited
    // to two bodies at once fails one account create on the unique email,
    // which aborts that transaction; run it again, and it finds the account.
    const { row, created } = await grant().catch((error: unknown) => {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        return grant();
    });

    const inviteEmailSent = created ? await sendInviteEmail(normalizedEmail, name, request) : false;

    return {
        admin: toBodyAdmin(row),
        created,
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
