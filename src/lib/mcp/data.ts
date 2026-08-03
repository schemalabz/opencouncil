import prisma from '@/lib/db/prisma';
import { Prisma, DiscussionStatus } from '@prisma/client';
import { env } from '@/env.mjs';
import { search } from '@/lib/search';
import { getCities, getCity } from '@/lib/db/cities';
import { getCouncilMeetingsForCity } from '@/lib/db/meetings';
import { getPeopleForCity, getPerson, type PersonWithRelations } from '@/lib/db/people';
import { getPartiesForCity, getParty } from '@/lib/db/parties';
import { getSubject, getDiscussionSecondsForSubjects } from '@/lib/db/subject';
import { getTranscript } from '@/lib/db/transcript';
import { upsertHighlightCore } from '@/lib/db/highlights-core';
import { canUserEditCity } from '@/lib/db/highlights-core';
import { NotFoundError, UnauthorizedError, BadRequestError } from '@/lib/api/errors';
import { requireVisibleMeeting } from './gate';
import { isSuperIdentity, type McpIdentity } from './auth';

const AUTH_HINT = 'Authentication required: create a personal MCP URL at https://opencouncil.gr/mcp and reconnect with it to create highlights.';

function baseUrl(): string {
    return env.NEXTAUTH_URL.replace(/\/$/, '');
}

const urls = {
    city: (cityId: string) => `${baseUrl()}/${cityId}`,
    meeting: (cityId: string, meetingId: string) => `${baseUrl()}/${cityId}/${meetingId}`,
    subject: (cityId: string, meetingId: string, subjectId: string) =>
        `${baseUrl()}/${cityId}/${meetingId}/subjects/${subjectId}`,
    person: (cityId: string, personId: string) => `${baseUrl()}/${cityId}/people/${personId}`,
    party: (cityId: string, partyId: string) => `${baseUrl()}/${cityId}/parties/${partyId}`,
    highlights: (cityId: string, meetingId: string) => `${baseUrl()}/${cityId}/${meetingId}/highlights`,
};

/** Turn contribution markdown ("[text](REF:UTTERANCE:id)") into plain text. */
function stripRefLinks(text: string): string {
    return text.replace(/\[([^\]]*)\]\(REF:[^)]*\)/g, '$1');
}

function truncate(text: string, maxChars: number): string {
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function isoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function mapRoles(person: PersonWithRelations) {
    return person.roles.map(role => ({
        name: role.name,
        name_en: role.name_en,
        isHead: role.isHead,
        party: role.party?.name ?? null,
        administrativeBody: role.administrativeBody?.name ?? null,
        startDate: role.startDate ? isoDate(role.startDate) : null,
        endDate: role.endDate ? isoDate(role.endDate) : null,
    }));
}

// --- Cities ---------------------------------------------------------------

export async function mcpListCities() {
    const cities = await getCities({});
    return {
        cities: cities.map(city => ({
            id: city.id,
            name: city.name,
            name_en: city.name_en,
            municipality: city.name_municipality,
            authorityType: city.authorityType,
            officialSupport: city.officialSupport,
            counts: {
                meetings: city._count.councilMeetings,
                people: city._count.persons,
                parties: city._count.parties,
            },
            url: urls.city(city.id),
        })),
    };
}

export async function mcpGetCity(cityId: string) {
    const city = await getCity(cityId);
    if (!city) throw new NotFoundError('City not found');

    const parties = await getPartiesForCity(cityId);
    return {
        id: city.id,
        name: city.name,
        name_en: city.name_en,
        municipality: city.name_municipality,
        authorityType: city.authorityType,
        officialSupport: city.officialSupport,
        counts: {
            meetings: city._count.councilMeetings,
            people: city._count.persons,
            parties: city._count.parties,
        },
        parties: parties.map(party => ({
            id: party.id,
            name: party.name,
            name_en: party.name_en,
            url: urls.party(cityId, party.id),
        })),
        url: urls.city(city.id),
    };
}

// --- People & parties -----------------------------------------------------

export async function mcpListPeople(cityId: string, activeOnly: boolean) {
    const people = await getPeopleForCity(cityId, activeOnly);
    return {
        people: people.map(person => ({
            id: person.id,
            name: person.name,
            name_en: person.name_en,
            roles: mapRoles(person),
            url: urls.person(cityId, person.id),
        })),
    };
}

export async function mcpGetPerson(personId: string) {
    const person = await getPerson(personId);
    if (!person) throw new NotFoundError('Person not found');

    return {
        id: person.id,
        name: person.name,
        name_en: person.name_en,
        cityId: person.cityId,
        profileUrl: person.profileUrl,
        roles: mapRoles(person),
        url: urls.person(person.cityId, person.id),
    };
}

export async function mcpGetParty(partyId: string) {
    const party = await getParty(partyId);
    if (!party) throw new NotFoundError('Party not found');

    return {
        id: party.id,
        name: party.name,
        name_en: party.name_en,
        cityId: party.cityId,
        people: party.people.map(person => ({
            id: person.id,
            name: person.name,
            url: urls.person(party.cityId, person.id),
        })),
        url: urls.party(party.cityId, party.id),
    };
}

// --- Meetings -------------------------------------------------------------

export async function mcpListMeetings(
    cityId: string,
    options: { page: number; pageSize: number; from?: string; to?: string; timeFilter?: 'upcoming' | 'past' },
    identity: McpIdentity
) {
    const meetings = await getCouncilMeetingsForCity(cityId, {
        includeUnreleased: isSuperIdentity(identity),
        page: options.page,
        pageSize: options.pageSize,
        from: options.from ? new Date(options.from) : undefined,
        to: options.to ? new Date(options.to) : undefined,
        timeFilter: options.timeFilter,
    });

    return {
        meetings: meetings.map(meeting => ({
            id: meeting.id,
            name: meeting.name,
            dateTime: meeting.dateTime.toISOString(),
            administrativeBody: meeting.administrativeBody?.name ?? null,
            released: meeting.released,
            subjectCount: meeting.subjects.length,
            url: urls.meeting(cityId, meeting.id),
        })),
        page: options.page,
    };
}

export async function mcpGetMeeting(cityId: string, meetingId: string, identity: McpIdentity) {
    await requireVisibleMeeting(cityId, meetingId, identity);

    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        include: {
            administrativeBody: true,
            subjects: {
                orderBy: [{ agendaItemIndex: 'asc' }, { name: 'asc' }],
                include: { topic: true },
            },
        },
    });
    if (!meeting) throw new NotFoundError('Meeting not found');

    // How long each subject was actually debated — the best available proxy for
    // how significant it was, since agenda order says nothing about weight.
    const discussionSeconds = await getDiscussionSecondsForSubjects(meeting.subjects.map(s => s.id));

    return {
        id: meeting.id,
        cityId,
        name: meeting.name,
        dateTime: meeting.dateTime.toISOString(),
        administrativeBody: meeting.administrativeBody?.name ?? null,
        youtubeUrl: meeting.youtubeUrl,
        agendaUrl: meeting.agendaUrl,
        subjects: meeting.subjects.map(subject => ({
            id: subject.id,
            name: subject.name,
            agendaItemIndex: subject.agendaItemIndex,
            topic: subject.topic?.name ?? null,
            discussionSeconds: Math.round(discussionSeconds.get(subject.id) ?? 0),
            description: truncate(subject.description, 200),
            url: urls.subject(cityId, meeting.id, subject.id),
        })),
        url: urls.meeting(cityId, meeting.id),
    };
}

// --- Subjects -------------------------------------------------------------

export async function mcpGetSubject(subjectId: string, identity: McpIdentity) {
    const subject = await getSubject(subjectId);
    if (!subject) throw new NotFoundError('Subject not found');
    await requireVisibleMeeting(subject.cityId, subject.councilMeetingId, identity);

    return {
        id: subject.id,
        name: subject.name,
        description: subject.description,
        cityId: subject.cityId,
        meetingId: subject.councilMeetingId,
        agendaItemIndex: subject.agendaItemIndex,
        topic: subject.topic?.name ?? null,
        location: subject.location?.text ?? null,
        introducedBy: subject.introducedBy
            ? { id: subject.introducedBy.id, name: subject.introducedBy.name }
            : null,
        contributions: subject.contributions.map(contribution => ({
            speaker: contribution.speaker?.name ?? contribution.speakerName ?? 'Unknown',
            text: stripRefLinks(contribution.text),
        })),
        decision: subject.decision
            ? {
                title: subject.decision.title,
                ada: subject.decision.ada,
                protocolNumber: subject.decision.protocolNumber,
                pdfUrl: subject.decision.pdfUrl,
            }
            : null,
        votes: subject.votes.map(vote => ({ person: vote.person.name, vote: vote.voteType })),
        url: urls.subject(subject.cityId, subject.councilMeetingId, subject.id),
    };
}

const SUBJECT_TRANSCRIPT_PAGE_SIZE = 150;

export async function mcpGetSubjectTranscript(subjectId: string, page: number, identity: McpIdentity) {
    const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, name: true, cityId: true, councilMeetingId: true },
    });
    if (!subject) throw new NotFoundError('Subject not found');
    await requireVisibleMeeting(subject.cityId, subject.councilMeetingId, identity);

    const where: Prisma.UtteranceWhereInput = {
        discussionSubjectId: subjectId,
        discussionStatus: { in: [DiscussionStatus.SUBJECT_DISCUSSION, DiscussionStatus.PROCEDURAL_VOTE, DiscussionStatus.VOTE] },
    };

    const [total, utterances] = await Promise.all([
        prisma.utterance.count({ where }),
        prisma.utterance.findMany({
            where,
            orderBy: { startTimestamp: 'asc' },
            skip: (page - 1) * SUBJECT_TRANSCRIPT_PAGE_SIZE,
            take: SUBJECT_TRANSCRIPT_PAGE_SIZE,
            select: {
                id: true,
                text: true,
                startTimestamp: true,
                endTimestamp: true,
                speakerSegment: {
                    select: {
                        speakerTag: {
                            select: { label: true, person: { select: { id: true, name: true } } },
                        },
                    },
                },
            },
        }),
    ]);

    return {
        subjectId: subject.id,
        subjectName: subject.name,
        cityId: subject.cityId,
        meetingId: subject.councilMeetingId,
        page,
        totalPages: Math.max(1, Math.ceil(total / SUBJECT_TRANSCRIPT_PAGE_SIZE)),
        utterances: utterances.map(utterance => ({
            utteranceId: utterance.id,
            speaker: utterance.speakerSegment.speakerTag.person?.name
                ?? utterance.speakerSegment.speakerTag.label,
            startSec: utterance.startTimestamp,
            endSec: utterance.endTimestamp,
            text: utterance.text,
        })),
        url: urls.subject(subject.cityId, subject.councilMeetingId, subject.id),
    };
}

// --- Transcripts ----------------------------------------------------------

export async function mcpGetTranscript(
    cityId: string,
    meetingId: string,
    options: { page: number; segmentsPerPage: number; includeUtteranceIds: boolean },
    identity: McpIdentity
) {
    await requireVisibleMeeting(cityId, meetingId, identity);

    const segments = await getTranscript(meetingId, cityId);
    const totalPages = Math.max(1, Math.ceil(segments.length / options.segmentsPerPage));
    const pageSegments = segments.slice(
        (options.page - 1) * options.segmentsPerPage,
        options.page * options.segmentsPerPage
    );

    // Resolve speaker names for the page's segments in one query
    const personIds = [...new Set(pageSegments.map(s => s.speakerTag.personId).filter((id): id is string => !!id))];
    const persons = await prisma.person.findMany({
        where: { id: { in: personIds } },
        select: { id: true, name: true },
    });
    const personNames = new Map(persons.map(person => [person.id, person.name]));

    return {
        cityId,
        meetingId,
        page: options.page,
        totalPages,
        segments: pageSegments.map(segment => ({
            speaker: (segment.speakerTag.personId && personNames.get(segment.speakerTag.personId))
                || segment.speakerTag.label,
            startSec: segment.startTimestamp,
            endSec: segment.endTimestamp,
            summary: segment.summary?.text ?? null,
            topics: segment.topicLabels.map(label => label.topic.name),
            text: segment.utterances.map(u => u.text).join(' '),
            ...(options.includeUtteranceIds && {
                utterances: segment.utterances.map(utterance => ({
                    utteranceId: utterance.id,
                    startSec: utterance.startTimestamp,
                    endSec: utterance.endTimestamp,
                    text: utterance.text,
                })),
            }),
        })),
        url: urls.meeting(cityId, meetingId),
    };
}

// --- Search ---------------------------------------------------------------

/**
 * Resolve topic labels (Greek or English, as returned by every tool that
 * reports a topic) to the ids the search index filters on. Agents never see a
 * topic id, so the filter has to speak in labels; an unknown one answers with
 * the whole taxonomy rather than silently matching nothing.
 */
async function resolveTopicIds(labels: string[]): Promise<string[]> {
    const topics = await prisma.topic.findMany({
        where: { deprecated: false },
        select: { id: true, name: true, name_en: true },
    });

    const byLabel = new Map<string, string>();
    for (const topic of topics) {
        byLabel.set(topic.name.trim().toLowerCase(), topic.id);
        byLabel.set(topic.name_en.trim().toLowerCase(), topic.id);
    }

    const ids: string[] = [];
    const unknown: string[] = [];
    for (const label of labels) {
        const id = byLabel.get(label.trim().toLowerCase());
        if (id) ids.push(id);
        else unknown.push(label);
    }

    if (unknown.length > 0) {
        const available = [...new Set(topics.map(topic => topic.name))].sort().join(', ');
        throw new BadRequestError(`Unknown topic(s): ${unknown.join(', ')}. Available topics: ${available}`);
    }

    return ids;
}

export async function mcpSearch(
    args: {
        query: string;
        cityIds?: string[];
        personIds?: string[];
        partyIds?: string[];
        topics?: string[];
        dateFrom?: string;
        dateTo?: string;
        page: number;
        pageSize: number;
    },
    identity: McpIdentity
) {
    const topicIds = args.topics?.length ? await resolveTopicIds(args.topics) : undefined;

    const response = await search({
        query: args.query,
        cityIds: args.cityIds,
        personIds: args.personIds,
        partyIds: args.partyIds,
        topicIds,
        dateRange: args.dateFrom || args.dateTo
            ? {
                start: args.dateFrom ?? '1970-01-01',
                end: args.dateTo ?? isoDate(new Date()),
            }
            : undefined,
        config: {
            size: args.pageSize,
            from: (args.page - 1) * args.pageSize,
            enableSemanticSearch: true,
            detailed: false,
        },
    });

    // Defense in depth: the ES index should only contain released content,
    // but never let an unreleased subject through to non-super callers. The
    // reported total shrinks with anything filtered here, so callers can't
    // infer the existence of unreleased subjects from a count mismatch.
    const visible = isSuperIdentity(identity)
        ? response.results
        : response.results.filter(result => result.councilMeeting.released);
    const total = Math.max(0, response.total - (response.results.length - visible.length));

    return {
        results: visible.map(result => ({
            id: result.id,
            title: result.name,
            snippet: truncate(result.description, 300),
            cityId: result.cityId,
            cityName: result.councilMeeting.city.name,
            meetingId: result.councilMeetingId,
            meetingDate: isoDate(result.councilMeeting.dateTime),
            topic: result.topic?.name ?? null,
            score: result.score,
            url: urls.subject(result.cityId, result.councilMeetingId, result.id),
        })),
        total,
        page: args.page,
    };
}

// --- Fetch (OpenAI deep-research compatible) ------------------------------

export async function mcpFetch(id: string, identity: McpIdentity) {
    if (id.startsWith('city:')) {
        const city = await mcpGetCity(id.slice('city:'.length));
        return {
            id,
            title: city.name,
            text: JSON.stringify(city, null, 2),
            url: city.url,
            metadata: { type: 'city' },
        };
    }

    if (id.startsWith('person:')) {
        const person = await mcpGetPerson(id.slice('person:'.length));
        return {
            id,
            title: person.name,
            text: JSON.stringify(person, null, 2),
            url: person.url,
            metadata: { type: 'person' },
        };
    }

    if (id.startsWith('party:')) {
        const party = await mcpGetParty(id.slice('party:'.length));
        return {
            id,
            title: party.name,
            text: JSON.stringify(party, null, 2),
            url: party.url,
            metadata: { type: 'party' },
        };
    }

    if (id.startsWith('meeting:')) {
        const [cityId, meetingId] = id.slice('meeting:'.length).split('/');
        if (!cityId || !meetingId) {
            throw new BadRequestError('Meeting ids look like "meeting:{cityId}/{meetingId}"');
        }
        const meeting = await mcpGetMeeting(cityId, meetingId, identity);
        return {
            id,
            title: meeting.name,
            text: JSON.stringify(meeting, null, 2),
            url: meeting.url,
            metadata: { type: 'meeting' },
        };
    }

    const subject = await mcpGetSubject(id.replace(/^subject:/, ''), identity);
    const text = [
        subject.description,
        ...subject.contributions.map(contribution => `${contribution.speaker}: ${contribution.text}`),
    ].join('\n\n');
    return {
        id,
        title: subject.name,
        text,
        url: subject.url,
        metadata: {
            type: 'subject',
            cityId: subject.cityId,
            meetingId: subject.meetingId,
            topic: subject.topic,
        },
    };
}

// --- Highlights -----------------------------------------------------------

export async function mcpCreateHighlight(
    identity: McpIdentity,
    args: {
        cityId: string;
        meetingId: string;
        name: string;
        utteranceIds: string[];
        subjectId?: string;
    }
) {
    if (!identity) {
        throw new UnauthorizedError(AUTH_HINT);
    }

    // Users may only highlight released meetings unless they can edit the city
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId: args.cityId, id: args.meetingId } },
        select: { released: true },
    });
    if (!meeting) throw new NotFoundError('Meeting not found');
    if (!meeting.released && identity.type === 'user' && !(await canUserEditCity(identity.userId, args.cityId))) {
        throw new NotFoundError('Meeting not found');
    }

    const highlight = await upsertHighlightCore(identity, {
        name: args.name,
        meetingId: args.meetingId,
        cityId: args.cityId,
        utteranceIds: args.utteranceIds,
        subjectId: args.subjectId,
    });

    return {
        id: highlight.id,
        name: highlight.name,
        utteranceCount: highlight.highlightedUtterances.length,
        url: urls.highlights(args.cityId, args.meetingId),
    };
}
