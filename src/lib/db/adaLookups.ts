import 'server-only';
import prisma from '@/lib/db/prisma';
import type { PollDecisionsResult } from '@/lib/apiTypes';
import type { AdaLookupOutcome } from '@/lib/db/types';
import { ADA_LOOKUP_SETTLE_MS } from '@/lib/db/types/adaLookups';
import { meetingNameSelect } from '@/lib/db/types';
import { meetingNameInCity } from '@/lib/meetingName';

/** What a pollDecisions task found for one typed ΑΔΑ. */
export async function getAdaLookupOutcome(cityId: string, meetingId: string, taskId: string, ada: string): Promise<AdaLookupOutcome> {
    const task = await prisma.taskStatus.findFirst({
        where: { id: taskId, cityId, councilMeetingId: meetingId, type: 'pollDecisions' },
        select: { status: true, responseBody: true, updatedAt: true },
    });
    if (!task) return { state: 'failed' };
    if (task.status === 'pending' || task.status === 'processing') return { state: 'running' };
    if (task.status !== 'succeeded' || !task.responseBody) return { state: 'failed' };

    const result = JSON.parse(task.responseBody) as Partial<PollDecisionsResult>;
    const lookup = result.lookups?.find(l => l.ada === ada);
    if (!lookup) return { state: 'failed' };
    if (lookup.outcome === 'not_found') return { state: 'notFound' };
    if (lookup.outcome === 'error') return { state: 'error' };

    const candidate = await prisma.decisionCandidate.findUnique({
        where: { cityId_ada: { cityId, ada } },
        select: {
            id: true,
            readStatus: true,
            decision: {
                select: {
                    subjectId: true,
                    subject: { select: { name: true, agendaItemIndex: true, councilMeetingId: true, councilMeeting: { select: { ...meetingNameSelect, city: { select: { timezone: true } } } } } },
                },
            },
        },
    });
    if (!candidate && Date.now() - task.updatedAt.getTime() < ADA_LOOKUP_SETTLE_MS) return { state: 'running' };
    const holder = candidate?.decision;
    // The page's candidate list leaves such a document out, so a found one
    // would otherwise read as a search that did not finish.
    if (candidate && !holder && candidate.readStatus === 'not_a_decision') return { state: 'notADecision' };
    return {
        state: 'found',
        candidateId: candidate && !candidate.decision ? candidate.id : null,
        organizationLabel: lookup.organizationLabel,
        linkedTo: holder
            ? {
                subjectId: holder.subjectId,
                meetingId: holder.subject.councilMeetingId,
                meetingName: meetingNameInCity(holder.subject.councilMeeting, 'el'),
                subjectName: holder.subject.name,
                agendaItemIndex: holder.subject.agendaItemIndex,
            }
            : null,
    };
}
