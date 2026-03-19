"use server";

import { ExtractDecisionsRequest, ExtractDecisionsResult, ExtractedDecisionData } from "../apiTypes";
import { startTask } from "./tasks";
import { getSubjectsForMeeting } from "../db/subject";
import { getCouncilMeeting } from "../db/meetings";
import { getPeopleForMeeting } from "../db/people";
import { withUserAuthorizedToEdit } from "../auth";
import prisma from "../db/prisma";
import { AttendanceStatus, DataSource, VoteType } from "@prisma/client";

export async function requestExtractDecisions(
    cityId: string,
    meetingId: string,
) {
    await withUserAuthorizedToEdit({ cityId });

    const subjects = await getSubjectsForMeeting(cityId, meetingId);
    const meeting = await getCouncilMeeting(cityId, meetingId);

    if (!meeting) {
        throw new Error("Council meeting not found");
    }

    // Only include subjects that have a decision with a PDF URL and an agenda item index
    const subjectsWithDecisions = subjects
        .filter(s => s.decision?.pdfUrl && s.agendaItemIndex != null)
        .map(s => ({
            subjectId: s.id,
            name: s.name,
            agendaItemIndex: s.agendaItemIndex!,
            decision: {
                pdfUrl: s.decision!.pdfUrl,
                ada: s.decision!.ada,
                protocolNumber: s.decision!.protocolNumber,
            },
        }));

    if (subjectsWithDecisions.length === 0) {
        throw new Error("No subjects with decision PDFs to extract");
    }

    // Send people for name matching on the tasks side
    const people = await getPeopleForMeeting(cityId, meeting.administrativeBodyId);
    const peopleForRequest = people.map(p => ({
        id: p.id,
        name: p.name,
    }));

    const body: Omit<ExtractDecisionsRequest, 'callbackUrl'> = {
        cityId,
        meetingId,
        subjects: subjectsWithDecisions,
        people: peopleForRequest,
    };

    return startTask('extractDecisions', body, meetingId, cityId);
}

export async function handleExtractDecisionsResult(
    taskId: string,
    result: ExtractDecisionsResult,
) {
    const task = await prisma.taskStatus.findUnique({
        where: { id: taskId },
        select: { cityId: true, councilMeetingId: true },
    });

    if (!task) {
        throw new Error("Task not found");
    }

    const warnings: string[] = [];

    for (const decision of result.decisions) {
        // 1. Update Decision excerpt and references
        await prisma.decision.updateMany({
            where: {
                subjectId: decision.subjectId,
            },
            data: {
                excerpt: decision.excerpt || null,
                references: decision.references || null,
            },
        });

        // 2. Create SubjectAttendance records (personIds already matched on tasks side)
        const attendanceRecords: { personId: string; status: AttendanceStatus }[] = [
            ...decision.presentMemberIds.map(id => ({ personId: id, status: 'PRESENT' as const })),
            ...decision.absentMemberIds.map(id => ({ personId: id, status: 'ABSENT' as const })),
        ];

        if (attendanceRecords.length > 0) {
            // Delete existing decision-sourced attendance for this subject (re-extraction replaces previous)
            await prisma.subjectAttendance.deleteMany({
                where: { subjectId: decision.subjectId, source: DataSource.decision },
            });

            for (const record of attendanceRecords) {
                await prisma.subjectAttendance.upsert({
                    where: {
                        subjectId_personId_source: {
                            subjectId: decision.subjectId,
                            personId: record.personId,
                            source: DataSource.decision,
                        },
                    },
                    create: {
                        subjectId: decision.subjectId,
                        personId: record.personId,
                        status: record.status,
                        source: DataSource.decision,
                        taskId,
                    },
                    update: {
                        status: record.status,
                        taskId,
                    },
                });
            }
        }

        // 3. Create SubjectVote records
        const isUnanimous = decision.voteResult?.includes('Ομόφωνα') || decision.voteResult?.includes('ομόφωνα');

        let voteRecords: { personId: string; voteType: VoteType }[] = [];

        if (decision.voteDetails.length > 0) {
            // Per-person vote details (personIds already matched)
            voteRecords = decision.voteDetails.map(d => ({
                personId: d.personId,
                voteType: d.vote,
            }));
        } else if (isUnanimous) {
            // Unanimous — create FOR vote for all present members
            voteRecords = decision.presentMemberIds.map(id => ({
                personId: id,
                voteType: 'FOR' as const,
            }));
        }

        if (voteRecords.length > 0) {
            // Delete existing decision-sourced votes for this subject (re-extraction replaces previous)
            await prisma.subjectVote.deleteMany({
                where: { subjectId: decision.subjectId, source: DataSource.decision },
            });

            for (const vote of voteRecords) {
                await prisma.subjectVote.upsert({
                    where: {
                        subjectId_personId_source: {
                            subjectId: decision.subjectId,
                            personId: vote.personId,
                            source: DataSource.decision,
                        },
                    },
                    create: {
                        subjectId: decision.subjectId,
                        personId: vote.personId,
                        voteType: vote.voteType,
                        source: DataSource.decision,
                        taskId,
                    },
                    update: {
                        voteType: vote.voteType,
                        taskId,
                    },
                });
            }
        }

        // Log unmatched members from this decision
        if (decision.unmatchedMembers.length > 0) {
            for (const name of decision.unmatchedMembers) {
                warnings.push(`Unmatched member "${name}" in subject "${decision.subjectId}"`);
            }
        }
    }

    if (warnings.length > 0) {
        console.log(`extractDecisions task ${taskId}: ${warnings.length} warnings:`);
        for (const w of warnings) {
            console.log(`  - ${w}`);
        }
    }

    console.log(`extractDecisions task ${taskId}: processed ${result.decisions.length} decisions`);
}
