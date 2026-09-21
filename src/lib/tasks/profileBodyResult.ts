// Server-only (NOT a "use server" action). The profile result is written by the
// task callback, which carries no session: the handler must stay off the Server
// Action surface, where every export is an endpoint a client can call with the
// action id. Its sibling `profileBody.ts` keeps the user-gated start of the
// task; the registry is the only way in here.
import "server-only";
import { ProfileBodyRequest, ProfileBodyResult } from "@/lib/apiTypes";
import prisma from "@/lib/db/prisma";
import { storeProfiledDecisionConventions } from "@/lib/db/administrativeBodiesInternal";

/**
 * The task's answer. The body it profiled is named by the request, not the
 * result: the task treats both ids as labels and never resolves them.
 */
export async function handleProfileBodyResult(taskId: string, result: ProfileBodyResult): Promise<void> {
    const task = await prisma.taskStatus.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("Task not found");
    if (task.type !== "profileBody") throw new Error(`Task ${taskId} is not a profileBody task`);

    const request = JSON.parse(task.requestBody) as ProfileBodyRequest;
    const administrativeBodyId = request.administrativeBodyId;
    if (!administrativeBodyId) throw new Error(`profileBody task ${taskId} named no administrative body`);
    if (!result?.conventions) throw new Error(`profileBody task ${taskId} returned no conventions`);

    const stored = await storeProfiledDecisionConventions(administrativeBodyId, result.conventions);
    console.log(
        stored
            ? `Stored profiled conventions for ${administrativeBodyId} from ${result.conventions.provenance.documentsSampled} documents (${result.adas?.length ?? 0} read)`
            : `Kept the confirmed conventions on ${administrativeBodyId}; the profile was discarded`,
    );
}
