// Server-only (NOT a "use server" action). Their neighbours in
// administrativeBodies.ts are Server Actions, where every export is an endpoint
// any client with the action id can call. Keeping these off that surface is what
// stops a client from writing a body's conventions, or reading a meeting id,
// around the callback route and around the admin form.
//
// The first two run for the task callback, which carries no user session, so a
// user gate cannot live inside them. The third is the person's own write: it
// reads its user here rather than taking one, so no caller can name another.
import "server-only";
import { AdministrativeBody, Prisma } from '@prisma/client';
import prisma from "./prisma";
import { getCurrentUser, withUserAuthorizedToEdit } from "../auth";
import { decisionConventionsSchema, isConfirmedByPerson, type DecisionConventions } from "../decisionConventions";

/**
 * Where a body-scoped task hangs its TaskStatus row: a TaskStatus belongs to a
 * council meeting, and profiling a body has no meeting of its own.
 */
export async function getMostRecentMeetingIdForBody(administrativeBodyId: string): Promise<string | null> {
    const meeting = await prisma.councilMeeting.findFirst({
        where: { administrativeBodyId },
        orderBy: { dateTime: 'desc' },
        select: { id: true },
    });
    return meeting?.id ?? null;
}

/**
 * The profiling task's answer, stored. A person's confirmation outranks it:
 * a row already confirmed (`provenance.source === 'manual'`) is left alone and
 * the write reports that it did nothing.
 *
 * The argument is validated against the full conventions schema — the callback
 * is token-authenticated, but this value is read back by the derivation and
 * pasted verbatim into the extraction prompt, so only a well-formed record
 * whose provenance says `profile` is ever written.
 */
export async function storeProfiledDecisionConventions(id: string, conventions: DecisionConventions): Promise<boolean> {
    const parsed = decisionConventionsSchema.safeParse(conventions);
    if (!parsed.success || parsed.data.provenance.source !== 'profile') {
        throw new Error('storeProfiledDecisionConventions takes a profiled conventions record');
    }
    const body = await prisma.administrativeBody.findUniqueOrThrow({
        where: { id },
        select: { decisionConventions: true },
    });
    const current = body.decisionConventions;
    if (isConfirmedByPerson(current)) return false;

    // The parsed value, not the argument: what the task sent minus anything the
    // schema does not name.
    await prisma.administrativeBody.update({
        where: { id },
        data: { decisionConventions: parsed.data as unknown as Prisma.InputJsonValue },
    });
    return true;
}

/**
 * A person confirms (or edits and confirms) the profiled conventions; provenance
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
