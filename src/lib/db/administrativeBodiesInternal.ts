// Server-only (NOT a "use server" action). A Server Action is an endpoint that
// any client with the action id can call. Keeping this write off that surface is
// what stops a client from writing a body's conventions around the admin form.
//
// It is the person's own write: it reads its user here rather than taking one,
// so no caller can name another.
import "server-only";
import { Prisma } from '@prisma/client';
import prisma from "./prisma";
import { withParsedConventions } from "@/lib/db/administrativeBodies";
import type { AdministrativeBodyWithSettings } from "@/lib/db/types";
import { getCurrentUser, withUserAuthorizedToEdit } from "@/lib/auth";
import type { DecisionConventions } from "@/lib/decisionConventions";
import { NotFoundError, notAuthorizedError } from "@/lib/api/errors";

/**
 * A person confirms (or edits and confirms) a body's conventions; provenance
 * becomes manual, which is what stops the derivation flagging every meeting of
 * the body.
 *
 * The route parses the record with the schema of its request. The author is
 * read from the session here, so no caller can supply it.
 */
export async function confirmDecisionConventions(id: string, conventions: DecisionConventions): Promise<AdministrativeBodyWithSettings> {
    const user = await getCurrentUser();
    if (!user) throw notAuthorizedError(false);
    const body = await prisma.administrativeBody.findUnique({ where: { id }, select: { cityId: true } });
    if (!body) throw new NotFoundError('Administrative body not found');
    await withUserAuthorizedToEdit({ cityId: body.cityId });
    const value: DecisionConventions = {
        ...conventions,
        provenance: { ...conventions.provenance, source: 'manual', confirmedBy: user.id, confirmedAt: new Date().toISOString() },
    };
    return withParsedConventions(await prisma.administrativeBody.update({
        where: { id },
        data: { decisionConventions: value as unknown as Prisma.InputJsonValue },
    }));
}
