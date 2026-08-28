import prisma from '@/lib/db/prisma';
import { Prisma, DiscussionStatus, type AdministrativeBodyType } from '@prisma/client';
import { searchInRealm } from '@/lib/search/core';
import { getCities, getCity, getListedCityAtPoint, filterCityIdsByRealm } from '@/lib/db/cities';
import { getHotSubjectsNearPoint, withDistances } from '@/lib/hotSubjects';
import { getCouncilMeetingsForCity } from '@/lib/db/meetings';
import { getPeopleForCity, getPerson, type PersonWithRelations } from '@/lib/db/people';
import { getPartiesForCity, getParty } from '@/lib/db/parties';
import {
    getAdministrativeBodiesForCity,
    getAdministrativeBodiesWithPublicMeetings,
} from '@/lib/db/administrativeBodies';
import { getSubject, getDiscussionSecondsForSubjects, getHotSubjectsCached } from '@/lib/db/subject';
import { currentBaseUrl, currentRealm } from './realm-context';
import { getTranscript } from '@/lib/db/transcript';
import { upsertHighlightCore, canUserEditCity, canActorManageHighlight } from '@/lib/db/highlights-core';
import { requestGenerateHighlightCore } from '@/lib/tasks/generateHighlight-core';
import { NotFoundError, UnauthorizedError, BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { canSeeUnreleased, requireVisibleMeeting } from './gate';
import { getRoleLabelAt, RoleTextTranslator } from '@/lib/utils/roles';
import { roleWithRelationsInclude } from '@/lib/db/types';
import { getTranslations } from 'next-intl/server';
import {
    renderOptionsFromRequestBody,
    resolveRenderOptions,
    sameRenderOptions,
    toGenerateOptions,
    type HighlightRenderOptions,
} from './render';
import { isSuperIdentity, type McpIdentity } from './auth';
import { isCustomer } from "@/lib/cityStatus";

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


/**
 * Speaker role labels ride along with quoted speech so consumers copy titles
 * instead of guessing them. The label is the site's own (getRoleLabelAt),
 * resolved as of the meeting date; MCP serves the Greek public record, so it
 * is always rendered from the Greek messages.
 */
const getRoleTranslations = (): Promise<RoleTextTranslator> =>
    getTranslations({ locale: 'el', namespace: 'Person' });

/** Turn contribution markdown ("[text](REF:UTTERANCE:id)") into plain text. */
function stripRefLinks(text: string): string {
    return text.replace(/\[([^\]]*)\]\(REF:[^)]*\)/g, '$1');
}

function truncate(text: string, maxChars: number): string {
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/**
 * unstable_cache revives Dates as ISO strings on cache hits, so date values
 * coming off cached queries arrive as either — accept both, always.
 */
function isoDate(date: Date | string): string {
    return new Date(date).toISOString().slice(0, 10);
}

/**
 * The one wire shape for a subject appearing in a list (search results,
 * list_hot_subjects, list_nearby_subjects). Each tool spreads this and appends
 * its single tool-specific field (score / discussionSeconds / distanceMeters),
 * so a consumer parsing "a subject" sees the same record — same fields, same
 * nullability, same date format — regardless of which tool produced it.
 * get_subject is the detail shape and deliberately different.
 */
function subjectSummary(subject: {
    id: string;
    name: string;
    description: string;
    cityId: string;
    cityName: string;
    meetingId: string;
    meetingDate: Date | string | null;
    meetingName: string | null;
    administrativeBody: string | null;
    topic: string | null;
}) {
    return {
        id: subject.id,
        title: subject.name,
        snippet: truncate(subject.description, 300),
        cityId: subject.cityId,
        cityName: subject.cityName,
        meetingId: subject.meetingId,
        meetingDate: subject.meetingDate != null ? isoDate(subject.meetingDate) : null,
        meetingName: subject.meetingName,
        administrativeBody: subject.administrativeBody,
        topic: subject.topic,
        url: urls.subject(subject.cityId, subject.meetingId, subject.id),
    };
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
            officialSupport: isCustomer(city.status),
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

    const allowed = new Set(await filterCityIdsByRealm(cityIds, currentRealm()));
    const unknown = cityIds.filter(id => !allowed.has(id));
    if (unknown.length > 0) {
        throw new NotFoundError(`Unknown municipality: ${unknown.join(', ')}. See list_cities.`);
    }
}

async function requireRealmCity(cityId: string): Promise<void> {
    return assertCitiesInRealm([cityId]);
}

/**
 * Body ids are opaque to the caller, so a hallucinated id, a stale one, or one
 * belonging to another city has to fail loudly. Filtering on it silently would
 * return an empty list — indistinguishable from a body that never met, which
 * is the reading these tools exist to prevent.
 */
async function requireCityBodies(cityId: string, bodyIds: string[]): Promise<void> {
    const known = await prisma.administrativeBody.findMany({
        where: { cityId, id: { in: bodyIds } },
        select: { id: true },
    });
    const found = new Set(known.map(body => body.id));
    const unknown = [...new Set(bodyIds)].filter(id => !found.has(id));
    if (unknown.length > 0) {
        throw new NotFoundError(
            `Unknown administrative body for ${cityId}: ${unknown.join(', ')}. See get_city.`
        );
    }
}

export async function mcpGetCity(cityId: string, identity: McpIdentity) {
    await requireRealmCity(cityId);
    const [city, parties, includeUnreleased] = await Promise.all([
        getCity(cityId),
        getPartiesForCity(cityId),
        canSeeUnreleased(identity, cityId),
    ]);
    if (!city) throw new NotFoundError('City not found');

    // The bodies carry the ids list_meetings filters by, so a body whose
    // meetings are all drafts would be a dead filter option for anyone who
    // cannot see drafts — offer it only to the callers who can.
    const administrativeBodies = includeUnreleased
        ? await getAdministrativeBodiesForCity(cityId)
        : await getAdministrativeBodiesWithPublicMeetings(cityId);

    return {
        id: city.id,
        name: city.name,
        name_en: city.name_en,
        municipality: city.name_municipality,
        authorityType: city.authorityType,
        officialSupport: isCustomer(city.status),
        counts: {
            meetings: city._count.councilMeetings,
            people: city._count.persons,
            parties: city._count.parties,
        },
        administrativeBodies: administrativeBodies.map(body => ({
            id: body.id,
            name: body.name,
            name_en: body.name_en,
            type: body.type,
        })),
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

/**
 * A meeting is summarized into subjects only after it is transcribed, so a
 * meeting with no subjects can still carry the full verbatim record — and an
 * agent that reads an empty agenda as "nothing here" misses it. Both helpers
 * answer only whether any segment exists, never how many.
 */
async function hasTranscript(cityId: string, meetingId: string): Promise<boolean> {
    const segment = await prisma.speakerSegment.findFirst({
        where: { cityId, meetingId },
        select: { id: true },
    });
    return segment !== null;
}

/**
 * The same question for a page of meetings, in one query rather than per row.
 * `some` is a semi-join, so it stops at each meeting's first segment; grouping
 * or counting would read every segment row on the page to reach the same
 * booleans.
 */
async function meetingsWithTranscript(cityId: string, meetingIds: string[]): Promise<Set<string>> {
    if (meetingIds.length === 0) return new Set();
    const transcribed = await prisma.councilMeeting.findMany({
        where: { cityId, id: { in: meetingIds }, speakerSegments: { some: {} } },
        select: { id: true },
    });
    return new Set(transcribed.map(meeting => meeting.id));
}

export async function mcpListMeetings(
    cityId: string,
    options: {
        page: number;
        pageSize: number;
        from?: string;
        to?: string;
        timeFilter?: 'upcoming' | 'past';
        administrativeBodyIds?: string[];
        administrativeBodyTypes?: AdministrativeBodyType[];
    },
    identity: McpIdentity
) {
    await requireRealmCity(cityId);
    if (options.administrativeBodyIds?.length) {
        await requireCityBodies(cityId, options.administrativeBodyIds);
    }
    const meetings = await getCouncilMeetingsForCity(cityId, {
        includeUnreleased: await canSeeUnreleased(identity, cityId),
        page: options.page,
        pageSize: options.pageSize,
        from: options.from ? new Date(`${options.from}T00:00:00.000Z`) : undefined,
        // `to` is documented as inclusive, and the underlying filter is `lte`
        // against a timestamp — so the bound has to be the end of that day.
        // Parsed as a bare date it lands on midnight and drops every meeting
        // held later that day.
        to: options.to ? new Date(`${options.to}T23:59:59.999Z`) : undefined,
        timeFilter: options.timeFilter,
        administrativeBodyIds: options.administrativeBodyIds,
        administrativeBodyTypes: options.administrativeBodyTypes,
    });

    const transcribed = await meetingsWithTranscript(cityId, meetings.map(meeting => meeting.id));

    return {
        meetings: meetings.map(meeting => ({
            id: meeting.id,
            name: meeting.name,
            dateTime: meeting.dateTime.toISOString(),
            administrativeBody: meeting.administrativeBody?.name ?? null,
            released: meeting.released,
            subjectCount: meeting.subjects.length,
            hasTranscript: transcribed.has(meeting.id),
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
                include: { topic: true, location: true },
            },
        },
    });
    if (!meeting) throw new NotFoundError('Meeting not found');

    // How long each subject was actually debated — the best available proxy for
    // how significant it was, since agenda order says nothing about weight.
    const [discussionSeconds, transcribed] = await Promise.all([
        getDiscussionSecondsForSubjects(meeting.subjects.map(s => s.id)),
        hasTranscript(cityId, meetingId),
    ]);

    // Location coordinates for mapped subjects. Centroids, not ST_X/ST_Y of
    // the raw geometry: locations can be lines or polygons. Raw SQL because
    // the geometry column is an Unsupported() type.
    const locationIds = [...new Set(meeting.subjects.map(s => s.locationId).filter((id): id is string => id !== null))];
    const centroids = new Map<string, { lng: number; lat: number }>();
    if (locationIds.length > 0) {
        const rows = await prisma.$queryRaw<Array<{ id: string; lng: number; lat: number }>>`
            SELECT id, ST_X(ST_Centroid(coordinates)) AS lng, ST_Y(ST_Centroid(coordinates)) AS lat
            FROM "Location" WHERE id IN (${Prisma.join(locationIds)})`;
        for (const row of rows) centroids.set(row.id, { lng: row.lng, lat: row.lat });
    }

    return {
        id: meeting.id,
        cityId,
        name: meeting.name,
        dateTime: meeting.dateTime.toISOString(),
        administrativeBody: meeting.administrativeBody?.name ?? null,
        youtubeUrl: meeting.youtubeUrl,
        agendaUrl: meeting.agendaUrl,
        hasTranscript: transcribed,
        // An empty agenda is the one shape an agent reads wrongly: it looks
        // like an empty meeting, when in fact the transcript is usually there
        // and only the summarization step has not run. Say so in the payload.
        ...(meeting.subjects.length === 0 && {
            note: transcribed
                ? 'This meeting has no subjects because it has not been summarized yet — not because nothing was said. '
                + 'The full verbatim transcript is available: read it with get_transcript (add includeUtteranceIds to '
                + 'pick utterances for a highlight). Summarize it yourself from the transcript rather than reporting '
                + 'the meeting as empty.'
                : meeting.dateTime > new Date()
                    ? 'This meeting has not been held yet, so there is nothing to read beyond the agenda document at agendaUrl.'
                    : 'This meeting was held, but no transcript has been produced for it. Its recording may still be '
                    + 'processing, or the meeting may never have been recorded.',
        }),
        subjects: meeting.subjects.map(subject => ({
            id: subject.id,
            name: subject.name,
            agendaItemIndex: subject.agendaItemIndex,
            topic: subject.topic?.name ?? null,
            discussionSeconds: Math.round(discussionSeconds.get(subject.id) ?? 0),
            description: truncate(subject.description, 200),
            location: subject.location
                ? {
                    text: subject.location.text,
                    ...(centroids.get(subject.location.id) ?? {}),
                }
                : null,
            url: urls.subject(cityId, meeting.id, subject.id),
        })),
        url: urls.meeting(cityId, meeting.id),
    };
}

// --- Subjects -------------------------------------------------------------

export async function mcpGetSubject(subjectId: string, identity: McpIdentity) {
    const subject = await getSubject(subjectId);
    if (!subject) throw new NotFoundError('Subject not found');
    const meeting = await requireVisibleMeeting(
        subject.cityId,
        subject.councilMeetingId,
        identity
    );
    const meetingDate = meeting.dateTime;
    const t = await getRoleTranslations();

    return {
        id: subject.id,
        name: subject.name,
        description: subject.description,
        cityId: subject.cityId,
        meetingId: subject.councilMeetingId,
        // Which body met, and when — denormalized so consumers never have to
        // fetch the meeting just to say «Δημοτική Επιτροπή» instead of
        // guessing (and getting) the wrong body.
        meetingName: meeting.name,
        meetingDate: isoDate(meetingDate),
        administrativeBody: meeting.administrativeBody?.name ?? null,
        agendaItemIndex: subject.agendaItemIndex,
        topic: subject.topic?.name ?? null,
        location: subject.location?.text ?? null,
        introducedBy: subject.introducedBy
            ? {
                id: subject.introducedBy.id,
                name: subject.introducedBy.name,
                role: getRoleLabelAt(subject.introducedBy.roles, t, meetingDate),
            }
            : null,
        contributions: subject.contributions.map(contribution => ({
            speaker: contribution.speaker?.name ?? contribution.speakerName ?? 'Unknown',
            role: getRoleLabelAt(contribution.speaker?.roles, t, meetingDate),
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
        // Votes are withheld until the extraction pipeline is reliable. The
        // site keeps showing them; the MCP API does not report them.
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
    const { dateTime: meetingDate } = await requireVisibleMeeting(
        subject.cityId,
        subject.councilMeetingId,
        identity
    );
    const t = await getRoleTranslations();

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
                            select: {
                                label: true,
                                person: {
                                    select: {
                                        id: true,
                                        name: true,
                                        roles: roleWithRelationsInclude,
                                    },
                                },
                            },
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
            role: getRoleLabelAt(utterance.speakerSegment.speakerTag.person?.roles, t, meetingDate),
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
    const { dateTime: meetingDate } = await requireVisibleMeeting(cityId, meetingId, identity);
    const t = await getRoleTranslations();

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
        select: { id: true, name: true, roles: roleWithRelationsInclude },
    });
    const personNames = new Map(persons.map(person => [person.id, person.name]));
    const personRoles = new Map(persons.map(person => [person.id, getRoleLabelAt(person.roles, t, meetingDate)]));

    return {
        cityId,
        meetingId,
        page: options.page,
        totalPages,
        ...(options.personId && { speaker: speakerName, segmentCount: segments.length }),
        segments: pageSegments.map(segment => ({
            speaker: (segment.speakerTag.personId && personNames.get(segment.speakerTag.personId))
                || segment.speakerTag.label,
            role: (segment.speakerTag.personId && personRoles.get(segment.speakerTag.personId)) || null,
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
            ...subjectSummary({
                id: row.id,
                name: row.name,
                description: row.description,
                cityId: row.cityId,
                cityName: row.cityName,
                meetingId: row.councilMeetingId,
                meetingDate: row.meetingDate ?? null,
                meetingName: row.meetingName ?? null,
                administrativeBody: row.bodyName ?? null,
                topic: row.topicName ?? null,
            }),
            discussionSeconds: row.discussionTimeSeconds ?? 0,
            speakerCount: row.speakerCount ?? 0,
        })),
    };
}

/**
 * "What's been discussed around this address" — resolve the municipality by
 * point-in-polygon, then rank its recent subjects the way the embed widget
 * does: subjects pinned within the radius first, municipality-wide (no
 * location) subjects filling remaining slots, each group ordered by the
 * standard recency/discussion blend.
 */
export async function mcpListNearbySubjects(args: {
    lat: number;
    lng: number;
    radiusMeters: number;
    limit: number;
}) {
    // Listed-only lookup: we carry boundaries for far more municipalities
    // than we publish, so the permissive map helper (getCityAtPoint) would
    // resolve δήμοι we don't cover and this tool would claim coverage it
    // doesn't have.
    const city = await getListedCityAtPoint(currentRealm(), args.lng, args.lat);
    if (!city) {
        // A confident "not covered" is often just transposed arguments —
        // probe the swapped point so the answer can self-correct.
        const swapped = await getListedCityAtPoint(currentRealm(), args.lat, args.lng);
        return {
            cityId: null,
            note: swapped
                ? 'This point is not inside any municipality covered by OpenCouncil — but swapping ' +
                  `lat and lng lands in ${swapped.name}, so the coordinates may be transposed.`
                : 'This point is not inside any municipality covered by OpenCouncil.',
            subjects: [],
        };
    }

    const center: [number, number] = [args.lng, args.lat];
    const { subjects, meetingsScanned, oldestMeetingDate } = await getHotSubjectsNearPoint(
        city.id,
        center,
        args.radiusMeters,
        args.limit
    );
    const ranked = await withDistances(subjects, center);

    return {
        cityId: city.id,
        cityName: city.name,
        radiusMeters: args.radiusMeters,
        // The window is a count of recent meetings, not a time span — these
        // bounds let a consumer report an empty list as "nothing since
        // {oldestMeetingScanned}" instead of the unbounded "nothing".
        meetingsScanned,
        oldestMeetingScanned: oldestMeetingDate != null ? isoDate(oldestMeetingDate) : null,
        subjects: ranked.map(({ subject, meeting, distanceMeters }) => ({
            ...subjectSummary({
                id: subject.id,
                name: subject.name,
                description: subject.description,
                cityId: meeting.cityId,
                cityName: city.name,
                meetingId: meeting.id,
                meetingDate: meeting.dateTime,
                meetingName: meeting.name,
                administrativeBody: meeting.administrativeBody?.name ?? null,
                topic: subject.topic?.name ?? null,
            }),
            distanceMeters,
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

    // searchInRealm caps the search to the realm it is given — an absent city
    // filter defaults to that realm's municipalities. The realm travels as an
    // argument because a tool handler runs outside a request scope, so the
    // Host-based resolution behind the `search()` Server Action is unavailable
    // here. The check below only turns a city id from another realm into a
    // clear error instead of an empty page.
    await assertCitiesInRealm(args.cityIds ?? []);

    const response = await searchInRealm({
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
            // This tool takes its filters as arguments, and the tool description
            // tells the caller to resolve names to ids first, so there is nothing
            // for a model to read out of the free text that the caller could not
            // state. Deriving it anyway narrows a page invisibly — and, because
            // each page derives independently and the model is not deterministic,
            // two pages of one query can be computed over different city sets.
            extractFilters: false,
        },
    }, currentRealm());

    // Stale-index hits (unreleased/deleted after indexing) are dropped inside
    // search() at the DB-hydration boundary, which also alerts admins. When
    // anything was dropped, the total may still count hidden hits on other
    // pages — omit it rather than report a number that leaks their existence.
    return {
        results: response.results.map(result => ({
            ...subjectSummary({
                id: result.id,
                name: result.name,
                description: result.description,
                cityId: result.cityId,
                cityName: result.councilMeeting.city.name,
                meetingId: result.councilMeetingId,
                meetingDate: result.councilMeeting.dateTime,
                meetingName: result.councilMeeting.name,
                administrativeBody: result.councilMeeting.administrativeBody?.name ?? null,
                topic: result.topic?.name ?? null,
            }),
            score: result.score,
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
        const city = await mcpGetCity(id.slice('city:'.length), identity);
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

const RENDER_STARTED_MESSAGE =
    'Video generation started — it takes a few minutes. Poll get_highlight for the result; '
    + 'the creator is also emailed when it finishes.';

type CreatedHighlightVideo =
    | { status: 'not_generated' }
    | { status: 'generating'; format: HighlightRenderOptions };

export async function mcpCreateHighlight(
    identity: McpIdentity,
    args: {
        cityId: string;
        meetingId: string;
        name: string;
        utteranceIds: string[];
        subjectId?: string;
        /** Render the clip in the same call, instead of a second round trip. */
        video?: Partial<HighlightRenderOptions>;
    }
) {
    if (!identity) {
        throw new UnauthorizedError(authHint());
    }

    // Same visibility as the read tools: released, or a draft the identity
    // may see (city editors, service keys).
    const meeting = await requireVisibleMeeting(args.cityId, args.meetingId, identity);

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

    // Deliberately no `id`: the MCP surface only ever creates highlights, so
    // this always takes upsertHighlightCore's create branch — the update
    // branch (which deletes the previous utterance selection) is unreachable
    // from here. The write-tool annotations in server.ts lean on exactly
    // this: `destructiveHint: false` on create_highlight AND on
    // generate_highlight_video (a re-render can only reformat content that
    // cannot change). Adding a highlightId parameter would falsify both.
    // The `video` argument below does not: it queues a render of this new
    // highlight, which destroys nothing. It does mean a retried call costs a
    // second render, so the render failure path returns the id rather than
    // throwing — see the catch below.
    const highlight = await upsertHighlightCore(identity, {
        name: args.name,
        meetingId: args.meetingId,
        cityId: args.cityId,
        utteranceIds: args.utteranceIds,
        subjectId: args.subjectId,
    });

    const created = {
        id: highlight.id,
        name: highlight.name,
        cityId: args.cityId,
        meetingId: args.meetingId,
        utteranceCount: highlight.highlightedUtterances.length,
        url: urls.highlights(args.cityId, args.meetingId),
    };

    // One return, so callers read `video` and `next` off one shape rather than
    // narrowing a union of branches.
    let video: CreatedHighlightVideo = { status: 'not_generated' };
    let next: string;

    if (!args.video) {
        next = 'The selection is saved without a video. Render one with generate_highlight_video only if the user asks for a clip.';
    } else if (!meeting.videoUrl) {
        // The highlight is already saved, so everything below reports back
        // instead of throwing: an error here would lose a selection the user
        // has approved, over a video they can still do without.
        next = 'The highlight is saved, but this meeting has no video, so no clip can be rendered from it.';
    } else {
        const requested = resolveRenderOptions(args.video);
        try {
            await requestGenerateHighlightCore(highlight.id, toGenerateOptions(requested));
            video = { status: 'generating', format: requested };
            next = RENDER_STARTED_MESSAGE;
        } catch (error) {
            // The render runs on a separate service, so it fails for reasons
            // the highlight does not share. Name the id the caller retries
            // with: a bare error would read as "nothing was saved" and earn a
            // second create_highlight, and a second highlight.
            console.error('MCP highlight render request failed:', error);
            next = 'The highlight is saved, but the video render could not be started. '
                + 'Retry it with generate_highlight_video and this highlight id.';
        }
    }

    return { ...created, video, next };
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
        note: RENDER_STARTED_MESSAGE,
    };
}
