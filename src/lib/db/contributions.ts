"use server";
import prisma from './prisma';
import { AdministrativeBodyType, Prisma, Topic } from '@prisma/client';
import { isUserAuthorizedToEdit } from '../auth';
import { ContributionForPerson, roleWithRelationsInclude } from './types';

async function shouldIncludeUnreleasedForPerson(personId: string): Promise<boolean> {
    const person = await prisma.person.findUnique({
        where: { id: personId },
        select: { cityId: true },
    });
    if (!person) return false;
    return isUserAuthorizedToEdit({ cityId: person.cityId });
}

async function shouldIncludeUnreleasedForParty(partyId: string): Promise<boolean> {
    const party = await prisma.party.findUnique({
        where: { id: partyId },
        select: { cityId: true },
    });
    if (!party) return false;
    return isUserAuthorizedToEdit({ cityId: party.cityId });
}

/**
 * Shared `CouncilMeeting` filter for contribution queries.
 * Keeps the released / admin-body / human-review gating in one place so the
 * different query functions can't drift.
 */
function buildMeetingFilter(
    includeUnreleased: boolean,
    administrativeBodyType?: AdministrativeBodyType | null,
): Prisma.CouncilMeetingWhereInput {
    return {
        ...(includeUnreleased ? {} : { released: true }),
        ...(administrativeBodyType ? { administrativeBody: { type: administrativeBodyType } } : {}),
        // Hide meetings whose admin body hides unreviewed transcripts and
        // that haven't passed human review.
        NOT: {
            administrativeBody: { showUnreviewedTranscript: false },
            taskStatuses: { none: { type: 'humanReview', status: 'succeeded' } },
        },
    };
}

/**
 * Returns the distinct topics across all subjects this person has contributed to.
 * Used to populate the topic-filter chips on the Person page so the list always
 * reflects what can actually be filtered (vs. segment-derived statistics).
 */
export async function getDistinctTopicsForSpeakerContributions(
    personId: string,
): Promise<Topic[]> {
    const includeUnreleased = await shouldIncludeUnreleasedForPerson(personId);
    const meetingFilter = buildMeetingFilter(includeUnreleased);

    const subjects = await prisma.subject.findMany({
        where: {
            contributions: { some: { speakerId: personId } },
            councilMeeting: meetingFilter,
            topicId: { not: null },
        },
        select: { topic: true },
        distinct: ['topicId'],
    });

    return subjects
        .map(s => s.topic)
        .filter((t): t is Topic => t !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLatestContributionsForSpeaker(
    personId: string,
    page: number = 1,
    pageSize: number = 5,
    topicId?: string | null,
): Promise<{ results: ContributionForPerson[]; totalCount: number }> {
    const skip = (page - 1) * pageSize;
    const includeUnreleased = await shouldIncludeUnreleasedForPerson(personId);
    const meetingFilter = buildMeetingFilter(includeUnreleased);

    const whereClause: Prisma.SpeakerContributionWhereInput = {
        speakerId: personId,
        subject: {
            councilMeeting: meetingFilter,
            ...(topicId ? { topicId } : {}),
        },
    };

    const [contributions, totalCount] = await Promise.all([
        prisma.speakerContribution.findMany({
            where: whereClause,
            include: {
                speaker: {
                    include: { roles: roleWithRelationsInclude },
                },
                subject: {
                    select: {
                        id: true,
                        name: true,
                        cityId: true,
                        councilMeetingId: true,
                        topic: true,
                        councilMeeting: {
                            include: { administrativeBody: true },
                        },
                    },
                },
            },
            orderBy: [
                { subject: { councilMeeting: { dateTime: 'desc' } } },
                { order: 'asc' },
            ],
            take: pageSize,
            skip,
        }),
        prisma.speakerContribution.count({ where: whereClause }),
    ]);

    return { results: contributions, totalCount };
}

export async function getLatestContributionsForParty(
    partyId: string,
    page: number = 1,
    pageSize: number = 5,
    administrativeBodyType?: AdministrativeBodyType | null,
): Promise<{ results: ContributionForPerson[]; totalCount: number }> {
    const skip = (page - 1) * pageSize;
    const includeUnreleased = await shouldIncludeUnreleasedForParty(partyId);
    const meetingFilter = buildMeetingFilter(includeUnreleased, administrativeBodyType);

    // A contribution belongs to the party if its speaker holds any role linking
    // them to the party. Mirrors getLatestSegmentsForParty (no date-bounded role
    // check — historical members are included).
    const whereClause: Prisma.SpeakerContributionWhereInput = {
        speaker: {
            roles: { some: { partyId } },
        },
        subject: {
            councilMeeting: meetingFilter,
        },
    };

    const [contributions, totalCount] = await Promise.all([
        prisma.speakerContribution.findMany({
            where: whereClause,
            include: {
                speaker: {
                    include: { roles: roleWithRelationsInclude },
                },
                subject: {
                    select: {
                        id: true,
                        name: true,
                        cityId: true,
                        councilMeetingId: true,
                        topic: true,
                        councilMeeting: {
                            include: { administrativeBody: true },
                        },
                    },
                },
            },
            orderBy: [
                { subject: { councilMeeting: { dateTime: 'desc' } } },
                { order: 'asc' },
            ],
            take: pageSize,
            skip,
        }),
        prisma.speakerContribution.count({ where: whereClause }),
    ]);

    return { results: contributions, totalCount };
}
