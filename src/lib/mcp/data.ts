import prisma from '@/lib/db/prisma';
import { Prisma, DiscussionStatus } from '@prisma/client';
import { search } from '@/lib/search';
import { getCities, getCity } from '@/lib/db/cities';
import { getCouncilMeetingsForCity } from '@/lib/db/meetings';
import { getPeopleForCity, getPerson, type PersonWithRelations } from '@/lib/db/people';
import { getPartiesForCity, getParty } from '@/lib/db/parties';
import { getSubject, getDiscussionSecondsForSubjects, getHotSubjectsCached } from '@/lib/db/subject';
import { currentBaseUrl, currentRealm } from './realm-context';
import { getTranscript } from '@/lib/db/transcript';
import { upsertHighlightCore, canUserEditCity, canActorManageHighlight } from '@/lib/db/highlights-core';
import { requestGenerateHighlightCore } from '@/lib/tasks/generateHighlight-core';
import { NotFoundError, UnauthorizedError, BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { canSeeUnreleased, requireVisibleMeeting } from './gate';
import { calculateVoteResult } from '@/lib/utils/votes';
import {
    renderOptionsFromRequestBody,
    resolveRenderOptions,
    sameRenderOptions,
    toGenerateOptions,
    type HighlightRenderOptions,
} from './render';
import { isSuperIdentity, type McpIdentity } from './auth';

/** Built per request: the hint must point at the host the caller is using. */
function authHint(): string {
    return `Authentication required: create a personal MCP URL at ${currentBaseUrl()}/mcp and reconnect with it to create highlights.`;
}

/**
 * Absolute URLs on the origin this request arrived on — a connector added from
 * opencouncil.fr must cite .fr links, never .gr ones.
 */
const urls = {
    city: (cityId: string) => `${currentBaseUrl()}/${cityId}`,
    meeting: (cityId: string, meetingId: string) => `${currentBaseUrl()}/${cityId}/${meetingId}`,
    subject: (cityId: string, meetingId: string, subjectId: string) =>
        `${currentBaseUrl()}/${cityId}/${meetingId}/subjects/${subjectId}`,
    person: (cityId: string, personId: string) => `${currentBaseUrl()}/${cityId}/people/${personId}`,
    party: (cityId: string, partyId: string) => `${currentBaseUrl()}/${cityId}/parties/${partyId}`,
    highlights: (cityId: string, meetingId: string) => `${currentBaseUrl()}/${cityId}/${meetingId}/highlights`,
    /** Deep-link to the moment something was said — the site's player seeks to ?t=. */
    moment: (cityId: string, meetingId: string, seconds: number) =>
        `${currentBaseUrl()}/${cityId}/${meetingId}?t=${Math.floor(seconds)}`,
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
    const cities = await getCities({}, currentRealm());
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

/**
 * Reject municipalities outside this connector's realm, so no tool — including
 * ones that take caller-supplied city ids — can reach across realms.
 */
async function assertCitiesInRealm(cityIds: string[]): Promise<void> {
    if (cityIds.length === 0) return;

    const inRealm = await prisma.city.findMany({
        where: { id: { in: cityIds }, realm: currentRealm() },
        select: { id: true },
    });
    const allowed = new Set(inRealm.map(city => city.id));
    const unknown = cityIds.filter(id => !allowed.has(id));
    if (unknown.length > 0) {
        throw new NotFoundError(`Unknown municipality: ${unknown.join(', ')}. See list_cities.`);
    }
}

async function requireRealmCity(cityId: string): Promise<void> {
    return assertCitiesInRealm([cityId]);
}

export async function mcpGetCity(cityId: string) {
    await requireRealmCity(cityId);
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
    await requireRealmCity(cityId);
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
    await requireRealmCity(person.cityId);

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
    await requireRealmCity(party.cityId);

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
    await requireRealmCity(cityId);
    const meetings = await getCouncilMeetingsForCity(cityId, {
        includeUnreleased: await canSeeUnreleased(identity, cityId),
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
        // Precomputed tally so consumers (humans and agents alike) never have
        // to count the array themselves — and with the same rules the site
        // uses: PRESENT and DID_NOT_VOTE are declarations, not votes.
        voteSummary: subject.votes.length > 0 ? calculateVoteResult(subject.votes) : null,
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
            // Cite or preview the exact moment — the site's player seeks here.
            url: urls.moment(subject.cityId, subject.councilMeetingId, utterance.startTimestamp),
        })),
        url: urls.subject(subject.cityId, subject.councilMeetingId, subject.id),
    };
}

// --- Transcripts ----------------------------------------------------------

export async function mcpGetTranscript(
    cityId: string,
    meetingId: string,
    options: { page: number; segmentsPerPage: number; includeUtteranceIds: boolean; personId?: string },
    identity: McpIdentity
) {
    await requireVisibleMeeting(cityId, meetingId, identity);

    const allSegments = await getTranscript(meetingId, cityId);

    // Speaker filter: "everything this councillor said in this meeting", which
    // is otherwise unreachable — a long meeting runs to 100+ transcript pages.
    // Scoped to the meeting's own municipality, so this can't confirm the
    // existence of people in other cities (or realms).
    let speakerName: string | null = null;
    if (options.personId) {
        const person = await prisma.person.findFirst({
            where: { id: options.personId, cityId },
            select: { name: true },
        });
        if (!person) throw new NotFoundError('Person not found in this municipality');
        speakerName = person.name;
    }
    const segments = options.personId
        ? allSegments.filter(segment => segment.speakerTag.personId === options.personId)
        : allSegments;

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
        ...(options.personId && { speaker: speakerName, segmentCount: segments.length }),
        segments: pageSegments.map(segment => ({
            speaker: (segment.speakerTag.personId && personNames.get(segment.speakerTag.personId))
                || segment.speakerTag.label,
            startSec: segment.startTimestamp,
            endSec: segment.endTimestamp,
            summary: segment.summary?.text ?? null,
            topics: segment.topicLabels.map(label => label.topic.name),
            text: segment.utterances.map(u => u.text).join(' '),
            url: urls.moment(cityId, meetingId, segment.startTimestamp),
            ...(options.includeUtteranceIds && {
                utterances: segment.utterances.map(utterance => ({
                    utteranceId: utterance.id,
                    startSec: utterance.startTimestamp,
                    endSec: utterance.endTimestamp,
                    text: utterance.text,
                    url: urls.moment(cityId, meetingId, utterance.startTimestamp),
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
        where: { deprecated: false, realm: currentRealm() },
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

/**
 * "What was hot in the councils lately" — the one call a journalist or social
 * editor starts from, and the only discovery path that doesn't need
 * Elasticsearch. Ranking and visibility rules come from the landing map.
 */
export async function mcpListHotSubjects(args: {
    daysBack: number;
    cityIds?: string[];
    topics?: string[];
    limit: number;
}) {
    const topicIds = args.topics?.length ? await resolveTopicIds(args.topics) : undefined;
    await assertCitiesInRealm(args.cityIds ?? []);

    const rows = await getHotSubjectsCached(
        currentRealm(),
        { daysBack: args.daysBack, cityIds: args.cityIds, topicIds },
        args.limit
    );

    return {
        daysBack: args.daysBack,
        subjects: rows.map(row => ({
            id: row.id,
            title: row.name,
            snippet: truncate(row.description, 300),
            cityId: row.cityId,
            cityName: row.cityName,
            meetingId: row.councilMeetingId,
            meetingDate: row.meetingDate?.slice(0, 10) ?? null,
            topic: row.topicName ?? null,
            discussionSeconds: row.discussionTimeSeconds ?? 0,
            // speakerCount is deliberately not exposed: toGeneralSubjectRow
            // derives it from the deprecated SubjectSpeakerSegment join, which
            // most subjects no longer populate, so it reads 0 for them.
            url: urls.subject(row.cityId, row.councilMeetingId, row.id),
        })),
    };
}

export async function mcpSearch(
    args: {
        query?: string;
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

    // The index has no notion of realms, so the city filter is what keeps a
    // connector inside its own: caller-supplied ids are checked, and an absent
    // filter defaults to this realm's municipalities rather than all of them.
    await assertCitiesInRealm(args.cityIds ?? []);
    const cityIds = args.cityIds?.length
        ? args.cityIds
        : (await getCities({}, currentRealm())).map(city => city.id);

    const response = await search({
        query: args.query,
        cityIds,
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

    // Stale-index hits (unreleased/deleted after indexing) are dropped inside
    // search() at the DB-hydration boundary, which also alerts admins. When
    // anything was dropped, the total may still count hidden hits on other
    // pages — omit it rather than report a number that leaks their existence.
    return {
        results: response.results.map(result => ({
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
        ...(response.dropped === 0
            ? { total: response.total }
            : { note: 'Some results on this page were unavailable; the total count is unknown.' }),
        page: args.page,
    };
}

/**
 * The municipalities whose non-public content this identity may reach —
 * everything for service keys and superadmins, the administered ones for a
 * personal token, none for anonymous callers. One query, shared by the search
 * release filter and the highlight listing.
 */
type EditableCities = { all: boolean; cityIds: Set<string> };

async function editableCities(identity: McpIdentity): Promise<EditableCities> {
    if (isSuperIdentity(identity)) return { all: true, cityIds: new Set() };
    if (identity?.type !== 'user') return { all: false, cityIds: new Set() };

    const user = await prisma.user.findUnique({
        where: { id: identity.userId },
        select: { isSuperAdmin: true, administers: { select: { cityId: true } } },
    });
    if (!user) return { all: false, cityIds: new Set() };
    if (user.isSuperAdmin) return { all: true, cityIds: new Set() };

    return {
        all: false,
        cityIds: new Set(user.administers.map(a => a.cityId).filter((id): id is string => !!id)),
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
        throw new UnauthorizedError(authHint());
    }

    // Same visibility as the read tools: released, or a draft the identity
    // may see (city editors, service keys).
    await requireVisibleMeeting(args.cityId, args.meetingId, identity);

    // Agents assemble utterance ids by hand, so a wrong one is routine. Say
    // which ids are wrong instead of letting the insert fail opaquely.
    const found = await prisma.utterance.findMany({
        where: { id: { in: args.utteranceIds } },
        select: { id: true, speakerSegment: { select: { cityId: true, meetingId: true } } },
    });
    const foundIds = new Set(found.map(utterance => utterance.id));
    const unknown = args.utteranceIds.filter(id => !foundIds.has(id));
    if (unknown.length > 0) {
        throw new BadRequestError(
            `Unknown utterance id(s): ${unknown.join(', ')}. Utterance ids come from get_subject_transcript, or get_transcript with includeUtteranceIds.`
        );
    }
    const foreign = found.filter(
        utterance =>
            utterance.speakerSegment.cityId !== args.cityId ||
            utterance.speakerSegment.meetingId !== args.meetingId
    );
    if (foreign.length > 0) {
        throw new BadRequestError(
            `Utterance(s) ${foreign.map(u => u.id).join(', ')} belong to a different meeting — a highlight can only span one meeting.`
        );
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
        video: { status: 'not_generated' as const },
        next: 'Render a shareable video with generate_highlight_video, then poll get_highlight until the video is ready.',
        url: urls.highlights(args.cityId, args.meetingId),
    };
}

export async function mcpListHighlights(
    identity: McpIdentity,
    args: { cityId?: string; meetingId?: string; limit: number }
) {
    if (!identity) throw new UnauthorizedError(authHint());
    if (args.cityId) await requireRealmCity(args.cityId);

    // Editors see their cities' highlights, everyone else only their own —
    // the same rule canViewHighlight applies on the site.
    const scope = await editableCities(identity);
    const ownership: Prisma.HighlightWhereInput[] = [
        ...(identity.type === 'user' ? [{ createdById: identity.userId }] : []),
        ...(scope.cityIds.size > 0 ? [{ cityId: { in: [...scope.cityIds] } }] : []),
    ];

    const where: Prisma.HighlightWhereInput = {
        meeting: { city: { realm: currentRealm() } },
        ...(args.cityId && { cityId: args.cityId }),
        ...(args.meetingId && { meetingId: args.meetingId }),
        ...(scope.all ? {} : { OR: ownership }),
    };

    const highlights = await prisma.highlight.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: args.limit,
        select: {
            id: true,
            name: true,
            cityId: true,
            meetingId: true,
            subjectId: true,
            videoUrl: true,
            muxPlaybackId: true,
            isShowcased: true,
            updatedAt: true,
            _count: { select: { highlightedUtterances: true } },
        },
    });

    return {
        highlights: highlights.map(highlight => ({
            id: highlight.id,
            name: highlight.name,
            cityId: highlight.cityId,
            meetingId: highlight.meetingId,
            subjectId: highlight.subjectId,
            utteranceCount: highlight._count.highlightedUtterances,
            hasVideo: Boolean(highlight.videoUrl),
            showcased: highlight.isShowcased,
            updatedAt: highlight.updatedAt.toISOString(),
            url: urls.highlights(highlight.cityId, highlight.meetingId),
        })),
    };
}

/**
 * Showcasing publishes a clip on the municipality's pages, so it takes
 * city-editor rights rather than mere ownership — matching the website.
 */
export async function mcpSetHighlightShowcase(identity: McpIdentity, highlightId: string, showcased: boolean) {
    if (!identity) throw new UnauthorizedError(authHint());

    const highlight = await prisma.highlight.findUnique({
        where: { id: highlightId },
        select: { cityId: true, meetingId: true, name: true, muxPlaybackId: true },
    });
    if (!highlight) throw new NotFoundError('Highlight not found');
    await requireRealmCity(highlight.cityId);

    const canEdit = identity.type === 'service' || (await canUserEditCity(identity.userId, highlight.cityId));
    if (!canEdit) {
        throw new ForbiddenError('Only city administrators can showcase highlights');
    }
    if (showcased && !highlight.muxPlaybackId) {
        throw new BadRequestError(
            'This highlight has no rendered video yet — run generate_highlight_video and wait for it to be ready.'
        );
    }

    await prisma.highlight.update({ where: { id: highlightId }, data: { isShowcased: showcased } });

    return {
        id: highlightId,
        name: highlight.name,
        showcased,
        url: urls.highlights(highlight.cityId, highlight.meetingId),
    };
}

async function requireManagedHighlight(identity: McpIdentity, highlightId: string) {
    if (!identity) {
        throw new UnauthorizedError(authHint());
    }

    const highlight = await prisma.highlight.findUnique({
        where: { id: highlightId },
        include: {
            _count: { select: { highlightedUtterances: true } },
            meeting: { select: { videoUrl: true } },
        },
    });
    if (!highlight) throw new NotFoundError('Highlight not found');

    if (!(await canActorManageHighlight(identity, highlight))) {
        throw new NotFoundError('Highlight not found');
    }

    return highlight;
}

/**
 * The video-render pipeline is asynchronous: a generateHighlight TaskStatus is
 * queued for the backend, and on success the callback writes videoUrl /
 * muxPlaybackId onto the highlight (see handleGenerateHighlightResult). Tasks
 * are matched to a highlight through requestBody.parts[0].id, same as
 * getGenerateHighlightTasksForHighlight in src/lib/db/tasks.ts.
 */
/** Every generateHighlight task for this highlight, newest first. */
async function generationTasksFor(highlight: { id: string; cityId: string; meetingId: string }) {
    const tasks = await prisma.taskStatus.findMany({
        where: {
            type: 'generateHighlight',
            cityId: highlight.cityId,
            councilMeetingId: highlight.meetingId,
        },
        orderBy: { createdAt: 'desc' },
        select: { status: true, stage: true, percentComplete: true, requestBody: true },
    });

    return tasks.filter(task => {
        try {
            const body = JSON.parse(task.requestBody) as { parts?: Array<{ id?: string }> };
            return body.parts?.[0]?.id === highlight.id;
        } catch {
            return false;
        }
    });
}

type HighlightVideoStatus =
    | { status: 'ready'; videoUrl: string; streamUrl?: string; format?: HighlightRenderOptions }
    | {
        status: 'generating';
        stage?: string;
        percentComplete?: number;
        format?: HighlightRenderOptions;
        /** The old clip, still playable until the new one replaces it. */
        replacingVideoUrl?: string;
    }
    | { status: 'failed' }
    | { status: 'not_generated' };

async function highlightVideoStatus(highlight: {
    id: string;
    cityId: string;
    meetingId: string;
    videoUrl: string | null;
    muxPlaybackId: string | null;
}): Promise<HighlightVideoStatus> {
    const tasks = await generationTasksFor(highlight);

    // Check for a running render first: during a re-render the highlight still
    // holds the previous clip, and reporting that as "ready" would hand callers
    // the old format while the one they asked for is still rendering.
    const inFlight = tasks.find(task => task.status !== 'failed' && task.status !== 'succeeded');
    if (inFlight) {
        const format = renderOptionsFromRequestBody(inFlight.requestBody);
        return {
            status: 'generating',
            ...(inFlight.stage && { stage: inFlight.stage }),
            ...(inFlight.percentComplete != null && { percentComplete: inFlight.percentComplete }),
            ...(format && { format }),
            ...(highlight.videoUrl && { replacingVideoUrl: highlight.videoUrl }),
        };
    }

    if (highlight.videoUrl) {
        // Report the settings the existing clip was rendered with, so callers
        // can tell whether it needs re-rendering in another format.
        const succeeded = tasks.find(task => task.status === 'succeeded');
        const format = succeeded ? renderOptionsFromRequestBody(succeeded.requestBody) : null;
        return {
            status: 'ready',
            videoUrl: highlight.videoUrl,
            ...(highlight.muxPlaybackId && { streamUrl: `https://stream.mux.com/${highlight.muxPlaybackId}.m3u8` }),
            ...(format && { format }),
        };
    }

    const task = tasks[0];
    if (!task) return { status: 'not_generated' };
    if (task.status === 'failed') return { status: 'failed' };
    // Succeeded, but no videoUrl yet: the task is marked succeeded before the
    // callback writes the url, so this is the gap between the two. Calling it
    // failed here would stop an agent polling seconds before the clip lands.
    return { status: 'generating' };
}

export async function mcpGetHighlight(identity: McpIdentity, highlightId: string) {
    const highlight = await requireManagedHighlight(identity, highlightId);
    const video = await highlightVideoStatus(highlight);

    return {
        id: highlight.id,
        name: highlight.name,
        cityId: highlight.cityId,
        meetingId: highlight.meetingId,
        subjectId: highlight.subjectId,
        utteranceCount: highlight._count.highlightedUtterances,
        video,
        ...(video.status === 'generating' && {
            note: 'Video generation takes a few minutes. Poll get_highlight again later; the creator is also emailed when it finishes.',
        }),
        url: urls.highlights(highlight.cityId, highlight.meetingId),
    };
}

export async function mcpGenerateHighlightVideo(
    identity: McpIdentity,
    highlightId: string,
    options?: Partial<HighlightRenderOptions>
) {
    const highlight = await requireManagedHighlight(identity, highlightId);
    const requested = resolveRenderOptions(options);
    const tasks = await generationTasksFor(highlight);

    // A second concurrent render would race the first to write videoUrl on the
    // same highlight, so let the one in flight finish.
    const inFlight = tasks.find(task => task.status !== 'failed' && task.status !== 'succeeded');
    if (inFlight) {
        return mcpGetHighlight(identity, highlightId);
    }

    // Re-render only when the existing clip is in a different format.
    if (highlight.videoUrl) {
        const succeeded = tasks.find(task => task.status === 'succeeded');
        const current = succeeded ? renderOptionsFromRequestBody(succeeded.requestBody) : null;
        if (current && sameRenderOptions(current, requested)) {
            return mcpGetHighlight(identity, highlightId);
        }
    }

    if (!highlight.meeting.videoUrl) {
        throw new BadRequestError('This meeting has no video, so a highlight video cannot be rendered.');
    }

    await requestGenerateHighlightCore(highlightId, toGenerateOptions(requested));

    return {
        id: highlight.id,
        name: highlight.name,
        video: { status: 'generating' as const, format: requested },
        note: 'Video generation started — it takes a few minutes. Poll get_highlight for the result; the creator is also emailed when it finishes.',
    };
}
