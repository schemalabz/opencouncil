/**
 * Profiling a body's decision conventions from its own Diavgeia documents.
 *
 * Extraction and the minutes both read AdministrativeBody.decisionConventions
 * to know what a body's documents state and how. Until now that record came
 * from a one-off survey run by hand; this starts the same reading from the
 * administrative-body form, for one body, and stores what comes back — unless a
 * person has already confirmed the row, in which case their statement stands.
 *
 * Server-only, not a "use server" module: that directive publishes every export
 * as a Server Action. The form calls the one entry point through
 * lib/actions/administrativeBodies.ts.
 */
import "server-only";
import { ProfileBodyRequest } from "@/lib/apiTypes";
import { startTask } from "./tasks";
import prisma from "@/lib/db/prisma";
import { withUserAuthorizedToEdit } from "@/lib/auth";
import { getMostRecentMeetingIdForBody } from "@/lib/db/administrativeBodiesInternal";

/**
 * Documents read per profile. The task's own default is 40; 20 is the sample
 * the survey settled on as enough to see a body's template, at about $1 a run.
 */
const SAMPLE_SIZE = 20;

/**
 * Start the profiling task for one body. Returns the task id so the form can
 * follow it; the conventions arrive minutes later, through the callback.
 */
export async function profileBodyConventions(administrativeBodyId: string): Promise<{ taskId: string }> {
    const body = await prisma.administrativeBody.findUnique({
        where: { id: administrativeBodyId },
        select: {
            id: true,
            name: true,
            cityId: true,
            diavgeiaUnitIds: true,
            city: { select: { diavgeiaUid: true } },
        },
    });
    if (!body) throw new Error("Administrative body not found");

    await withUserAuthorizedToEdit({ cityId: body.cityId });

    // The same two fields pollDecisions selects documents with: the city's
    // organization on Diavgeia and the body's unit scopes inside it.
    if (!body.city.diavgeiaUid) throw new Error("City does not have a Diavgeia UID configured");
    if (!body.diavgeiaUnitIds.length) throw new Error("Administrative body has no Diavgeia unit ids configured");

    // A TaskStatus row belongs to a council meeting; profiling belongs to the
    // body. Its most recent meeting carries the row.
    const councilMeetingId = await getMostRecentMeetingIdForBody(body.id);
    if (!councilMeetingId) throw new Error("Administrative body has no meeting to hang the task off");

    const request: Omit<ProfileBodyRequest, "callbackUrl"> = {
        cityId: body.cityId,
        administrativeBodyId: body.id,
        diavgeiaUid: body.city.diavgeiaUid,
        diavgeiaUnitIds: body.diavgeiaUnitIds,
        sampleSize: SAMPLE_SIZE,
    };

    const task = await startTask("profileBody", request, councilMeetingId, body.cityId);
    return { taskId: task.id };
}
