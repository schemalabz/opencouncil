// Server-only (NOT a "use server" action). A Server Action is an endpoint that
// any client with the action id can call. Keeping this write off that surface is
// what stops a client from writing a body's conventions around the admin form.
//
// It is the person's own write: it reads its user here rather than taking one,
// so no caller can name another.
import "server-only";
import { AdministrativeBody, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { getCurrentUser, withUserAuthorizedToEdit } from "@/lib/auth";
import { decisionConventionsSchema, type DecisionConventions } from "@/lib/decisionConventions";

/**
 * A person confirms (or edits and confirms) a body's conventions; provenance
 * becomes manual, which is what stops the derivation flagging every meeting of
 * the body.
 *
 * The record is parsed here and the author is read from the session here, so
 * neither can be supplied by a caller. Both were the route's business while this
 * lived among the Server Actions, where the route was only one of the ways in.
 */
export async function confirmDecisionConventions(id: string, conventions: unknown): Promise<AdministrativeBody> {
    const parsed = decisionConventionsSchema.parse(conventions);
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    const body = await prisma.administrativeBody.findUniqueOrThrow({ where: { id }, select: { cityId: true } });
    await withUserAuthorizedToEdit({ cityId: body.cityId });
    const value: DecisionConventions = {
        ...parsed,
        provenance: { ...parsed.provenance, source: 'manual', confirmedBy: user.id, confirmedAt: new Date().toISOString() },
    };
    return prisma.administrativeBody.update({
        where: { id },
        data: { decisionConventions: value as unknown as Prisma.InputJsonValue },
    });
}
