import 'server-only';
import { Prisma } from '@prisma/client';
import prisma from './prisma';

/**
 * What the Πίνακας αποφάσεων reads of a subject: its place on the agenda, the
 * linked decision and the vote types. The export reads only this, not the
 * meeting page's subject payload with its contributions and highlights.
 */
export const decisionTableSubjectSelect = {
    id: true,
    name: true,
    agendaItemTitle: true,
    agendaItemIndex: true,
    agendaSectionIndex: true,
    nonAgendaReason: true,
    withdrawn: true,
    outcome: true,
    decision: { select: { decisionNumber: true, protocolNumber: true, pdfUrl: true, ada: true, summary: true } },
    votes: { select: { voteType: true } },
} satisfies Prisma.SubjectSelect;

export type DecisionTableSubjectRow = Prisma.SubjectGetPayload<{ select: typeof decisionTableSubjectSelect }>;

export async function getDecisionTableSubjects(cityId: string, meetingId: string): Promise<DecisionTableSubjectRow[]> {
    return prisma.subject.findMany({
        where: { cityId, councilMeetingId: meetingId },
        select: decisionTableSubjectSelect,
    });
}

const decisionTableCitySelect = { name_municipality: true, timezone: true } satisfies Prisma.CitySelect;

export async function getDecisionTableCity(cityId: string) {
    return prisma.city.findUnique({ where: { id: cityId }, select: decisionTableCitySelect });
}
