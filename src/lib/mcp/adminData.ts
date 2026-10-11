import "server-only";
import { AuthorityType, CityLanguage, Prisma, type City } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { env } from '@/env.mjs';
import prisma from '@/lib/db/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/api/errors';
import { createCityDirect } from '@/lib/db/citiesAdmin';
import { populateCity, type CityPopulationData } from '@/lib/db/cityPopulate';
import { createMeetingWithEffects, updateMeetingWithEffects, type MeetingDetailsEdit } from '@/lib/meetingWrites';
import { startMeetingTask, type MeetingTaskRequest } from '@/lib/tasks/startMeetingTask';
import { constructPublicUrl, generatePresignedUrl } from '@/lib/s3';
import { revalidateAfterResponse } from '@/lib/cache/afterResponse';
import { CITY_DEFAULTS } from '@/lib/zod-schemas/city';
import { REALMS } from '@/lib/realm';
import type { McpIdentity } from './auth';
import { requireCityAdmin, requireSuperadmin } from './adminAccess';
import { requireVisibleMeeting } from './gate';
import { mcpTaskSummary } from './taskSummary';
import { requireCityBodies, requireRealmCity } from './realmGuards';
import { currentBaseUrl, currentRealm } from './realm-context';

/**
 * The write side of the MCP server for administrators: meetings and their
 * tasks for a city administrator, cities for a superadmin. Every function
 * authorizes first, with requireCityAdmin or requireSuperadmin, and only then
 * looks at its arguments. The shared writes below them check nothing.
 */

const meetingUrl = (cityId: string, meetingId: string) => `${currentBaseUrl()}/${cityId}/${meetingId}`;

// --- Meetings -------------------------------------------------------------

export async function mcpCreateMeeting(
    identity: McpIdentity,
    args: {
        cityId: string;
        name: string;
        name_en: string;
        dateTime: string;
        youtubeUrl?: string;
        agendaUrl?: string;
        administrativeBodyId?: string;
        processAgenda: boolean;
    }
) {
    await requireCityAdmin(identity, args.cityId);
    await requireRealmCity(args.cityId);
    if (args.administrativeBodyId) {
        await requireCityBodies(args.cityId, [args.administrativeBodyId]);
    }

    const { meeting, processAgendaStatus } = await createMeetingWithEffects(args.cityId, {
        name: args.name,
        name_en: args.name_en,
        date: new Date(args.dateTime),
        youtubeUrl: args.youtubeUrl,
        agendaUrl: args.agendaUrl,
        administrativeBodyId: args.administrativeBodyId,
        processAgenda: args.processAgenda,
    });

    return {
        id: meeting.id,
        cityId: meeting.cityId,
        name: meeting.name,
        dateTime: meeting.dateTime.toISOString(),
        administrativeBody: meeting.administrativeBody?.name ?? null,
        released: meeting.released,
        url: meetingUrl(meeting.cityId, meeting.id),
        ...(processAgendaStatus && { processAgendaStatus }),
        next: 'The meeting is saved as a draft: only administrators see it. '
            + 'Transcription and release are done on the site, on the admin page of the meeting.',
    };
}

export async function mcpUpdateMeeting(
    identity: McpIdentity,
    args: {
        cityId: string;
        meetingId: string;
        name?: string;
        name_en?: string;
        dateTime?: string;
        youtubeUrl?: string | null;
        agendaUrl?: string | null;
        administrativeBodyId?: string | null;
    }
) {
    await requireCityAdmin(identity, args.cityId);
    // Realm-scoped, and an administrator of the city passes it for a draft.
    await requireVisibleMeeting(args.cityId, args.meetingId, identity);
    if (args.administrativeBodyId) {
        await requireCityBodies(args.cityId, [args.administrativeBodyId]);
    }

    const edit: MeetingDetailsEdit = {
        ...(args.name !== undefined && { name: args.name }),
        ...(args.name_en !== undefined && { name_en: args.name_en }),
        ...(args.dateTime !== undefined && { dateTime: new Date(args.dateTime) }),
        ...(args.youtubeUrl !== undefined && { youtubeUrl: args.youtubeUrl }),
        ...(args.agendaUrl !== undefined && { agendaUrl: args.agendaUrl }),
        ...(args.administrativeBodyId !== undefined && { administrativeBodyId: args.administrativeBodyId }),
    };
    if (Object.keys(edit).length === 0) {
        throw new BadRequestError('Nothing to update: pass at least one field to change.');
    }

    const meeting = await updateMeetingWithEffects(args.cityId, args.meetingId, edit);

    return {
        id: meeting.id,
        cityId: meeting.cityId,
        name: meeting.name,
        name_en: meeting.name_en,
        dateTime: meeting.dateTime.toISOString(),
        youtubeUrl: meeting.youtubeUrl,
        agendaUrl: meeting.agendaUrl,
        administrativeBody: meeting.administrativeBody?.name ?? null,
        released: meeting.released,
        url: meetingUrl(meeting.cityId, meeting.id),
    };
}

export async function mcpStartTask(
    identity: McpIdentity,
    args: { cityId: string; meetingId: string } & MeetingTaskRequest
) {
    const { cityId, meetingId, ...request } = args;
    await requireCityAdmin(identity, cityId);
    await requireVisibleMeeting(cityId, meetingId, identity);

    const task = await startMeetingTask(cityId, meetingId, request);

    return {
        ...mcpTaskSummary({ ...task, error: null }),
        cityId,
        meetingId,
        // The transcribe core stores the video it was given on the meeting.
        ...(request.type === 'transcribe' && request.videoUrl && { youtubeUrl: request.videoUrl }),
        url: meetingUrl(cityId, meetingId),
        next: 'The task runs on the task server and takes minutes. Poll get_meeting: its `tasks` list '
            + 'carries the status, and a failed task carries the error.',
    };
}

/** The agenda formats that the task server reads (documentConversion in opencouncil-tasks). */
const AGENDA_CONTENT_TYPES = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;
type AgendaFormat = keyof typeof AGENDA_CONTENT_TYPES;
const AGENDA_UPLOAD_URL_SECONDS = 300;

export async function mcpCreateAgendaUploadUrl(
    identity: McpIdentity,
    args: { cityId: string; identifier: string; format: AgendaFormat }
) {
    await requireCityAdmin(identity, args.cityId);
    await requireRealmCity(args.cityId);

    const contentType = AGENDA_CONTENT_TYPES[args.format];
    // A random suffix in place of the collision loop of the upload route: the
    // name stays readable in the bucket, and needs no lookup.
    const key = `uploads/${args.cityId}_${args.identifier}_agenda_${uuidv4().slice(0, 8)}.${args.format}`;
    const uploadUrl = await generatePresignedUrl(key, contentType, AGENDA_UPLOAD_URL_SECONDS);

    // Spaces ignores the ACL that the signature carries in the query string:
    // the PUT must send it as a header, or the file stays private.
    return {
        uploadUrl,
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'x-amz-acl': 'public-read' },
        expiresIn: AGENDA_UPLOAD_URL_SECONDS,
        publicUrl: constructPublicUrl(env.DO_SPACES_BUCKET, key),
        next: 'Send the file with a PUT to uploadUrl, with exactly these headers, within expiresIn seconds. '
            + 'Without the x-amz-acl header the file stays private. '
            + 'Then pass publicUrl as agendaUrl to create_meeting or update_meeting.',
    };
}

// --- Cities ---------------------------------------------------------------

/**
 * The unique index is the check: a lookup first would leave a window where
 * two creates both pass it, and the loser would then read as an internal
 * error rather than as a taken id.
 */
async function createCityOrConflict(data: Parameters<typeof createCityDirect>[0]): Promise<City> {
    try {
        return await createCityDirect(data);
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ConflictError(`A city with the id "${data.id}" already exists.`);
        }
        throw error;
    }
}

export async function mcpCreateCity(
    identity: McpIdentity,
    args: {
        id: string;
        name: string;
        name_en: string;
        name_municipality: string;
        name_municipality_en: string;
        timezone: string;
        authorityType: AuthorityType;
        language?: CityLanguage;
    }
) {
    await requireSuperadmin(identity);

    // A connector belongs to one realm, so the city it creates does too. The
    // fields a tool does not offer take the defaults of the site's form, and
    // `pending` keeps the city off every public page.
    const realm = currentRealm();
    const city = await createCityOrConflict({
        ...CITY_DEFAULTS,
        id: args.id,
        name: args.name,
        name_en: args.name_en,
        name_municipality: args.name_municipality,
        name_municipality_en: args.name_municipality_en,
        timezone: args.timezone,
        authorityType: args.authorityType,
        language: args.language ?? REALMS[realm].defaultLocale,
        realm,
        logoImage: null,
        wikipediaId: null,
        diavgeiaUid: null,
        population: null,
    });

    // The old id list is a 404 for the URL this answer carries, so the next
    // request must not be served from it.
    revalidateAfterResponse({ blockingTags: ['cities:all'] });

    return {
        id: city.id,
        name: city.name,
        status: city.status,
        realm: city.realm,
        language: city.language,
        url: `${currentBaseUrl()}/${city.id}`,
        next: 'The city is saved as pending, so it is not public. Fill it with populate_city. '
            + `Add the logo and the boundary on the site: ${currentBaseUrl()}/admin/cities.`,
    };
}

/**
 * The route writes a role whose party or body name matches nothing with a null
 * link. A person types those names into a form that offers only real ones; an
 * agent writes them by hand, so a wrong name is routine and must fail loudly.
 */
function assertRoleReferences(data: CityPopulationData) {
    const parties = new Set(data.parties.map(party => party.name));
    const bodies = new Set(data.administrativeBodies.map(body => body.name));
    const problems: string[] = [];

    for (const person of data.people) {
        for (const role of person.roles ?? []) {
            if (role.type === 'party' && !(role.partyName && parties.has(role.partyName))) {
                problems.push(`${person.name}: party role names the unknown party "${role.partyName ?? ''}"`);
            }
            if (role.type === 'adminBody' && !(role.administrativeBodyName && bodies.has(role.administrativeBodyName))) {
                problems.push(`${person.name}: adminBody role names the unknown body "${role.administrativeBodyName ?? ''}"`);
            }
        }
    }

    if (problems.length > 0) {
        throw new BadRequestError(
            `Roles must name a party or an administrative body from this same call, by its exact \`name\`. ${problems.join('; ')}.`
        );
    }
}

export async function mcpPopulateCity(
    identity: McpIdentity,
    data: CityPopulationData
) {
    await requireSuperadmin(identity);
    await requireRealmCity(data.cityId);
    assertRoleReferences(data);

    const stats = await populateCity(data.cityId, data);
    revalidateAfterResponse({ tags: [`city:${data.cityId}`] });

    return {
        cityId: data.cityId,
        ...stats,
        url: `${currentBaseUrl()}/${data.cityId}`,
        next: 'The city stays pending. A superadmin checks the import and sets the status on the site.',
    };
}
