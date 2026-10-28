import "server-only";
import { CityLanguage, Prisma, type City } from '@prisma/client';
import { env } from '@/env.mjs';
import prisma from '@/lib/db/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/api/errors';
import { createCityDirect } from '@/lib/db/citiesAdmin';
import { populateCity } from '@/lib/db/cityPopulate';
import type { CityPopulationData } from '@/lib/zod-schemas/cityPopulation';
import { createMeetingWithEffects, updateMeetingWithEffects, type MeetingDetailsEdit } from '@/lib/meetingWrites';
import { pickRecordInput } from '@/lib/meetingLifecycleRules';
import { startMeetingTask } from '@/lib/tasks/startMeetingTask';
import { constructPublicUrl, generatePresignedUrl } from '@/lib/s3';
import { revalidateAfterResponse } from '@/lib/cache/afterResponse';
import { CITY_DEFAULTS, cityLanguageSchema } from '@/lib/zod-schemas/city';
import { ALL_REALMS, REALMS, getRealmDisplayName } from '@/lib/realm';
import { countCitiesByRealmAndStatus } from '@/lib/db/citiesAdmin';
import type { McpIdentity } from './auth';
import type {
    AgendaUploadUrlToolArgs,
    CreateCityToolArgs,
    CreateMeetingToolArgs,
    StartTaskToolArgs,
    UpdateMeetingToolArgs,
} from './adminToolSchemas';
import { requireBodyAdmin, requireCityAdmin, requireMeetingAdmin, requireSuperadmin } from './adminAccess';
import { requireVisibleMeeting } from './gate';
import { mcpTaskSummary } from './taskSummary';
import { requireCityBodies, requireRealmCity } from './realmGuards';
import { cityBaseUrl, currentBaseUrl, currentRealm, rememberCityRealm } from './realm-context';
import { meetingDisplayName, meetingLabel } from '@/lib/meetingName';
import { getCityTimezone } from '@/lib/db/cityTimezone';
import { isNewsPhase } from '@/lib/notifications/freshness';

/**
 * The write side of the MCP server for administrators: meetings and their
 * tasks for a city administrator or for the administrator of the body that
 * meets, cities for a superadmin. Every function authorizes first, with a
 * guard from adminAccess, and only then looks at its arguments. The shared
 * writes below them check nothing.
 */

const meetingUrl = (cityId: string, meetingId: string) => `${cityBaseUrl(cityId)}/${cityId}/${meetingId}`;

// --- Meetings -------------------------------------------------------------

export async function mcpCreateMeeting(identity: McpIdentity, args: CreateMeetingToolArgs) {
    // A body admin creates meetings of their body only; a meeting with no
    // body is the city admin's.
    if (args.administrativeBodyId) {
        await requireBodyAdmin(identity, args.cityId, args.administrativeBodyId);
    } else {
        await requireCityAdmin(identity, args.cityId);
    }
    await requireRealmCity(args.cityId);
    if (args.administrativeBodyId) {
        await requireCityBodies(args.cityId, [args.administrativeBodyId]);
    }

    const { meeting, processAgendaStatus } = await createMeetingWithEffects(args.cityId, {
        date: new Date(args.dateTime),
        youtubeUrl: args.youtubeUrl,
        agendaUrl: args.agendaUrl,
        administrativeBodyId: args.administrativeBodyId,
        processAgenda: args.processAgenda,
        postponedFromId: args.postponedFromId,
        ...pickRecordInput(args),
    });

    const timezone = await getCityTimezone(meeting.cityId);

    return {
        id: meeting.id,
        cityId: meeting.cityId,
        name: meetingLabel(meeting, 'el', timezone),
        title: meetingDisplayName(meeting, 'el', timezone),
        dateTime: meeting.dateTime.toISOString(),
        administrativeBody: meeting.administrativeBody?.name ?? null,
        released: meeting.released,
        url: meetingUrl(meeting.cityId, meeting.id),
        ...(processAgendaStatus && { processAgendaStatus }),
        next: 'The meeting is saved as a draft: only administrators see it, and no subscriber is notified '
            + 'until it is released. Transcription and release are done on the site, on the admin page of the meeting.',
    };
}

export async function mcpUpdateMeeting(identity: McpIdentity, args: UpdateMeetingToolArgs) {
    await requireMeetingAdmin(identity, args.cityId, args.meetingId);
    // Realm-scoped, and an administrator of the meeting passes it for a draft.
    const current = await requireVisibleMeeting(args.cityId, args.meetingId, identity);
    // A body admin may not move a meeting away from their body, nor take the
    // meeting of another body: the new body needs its own right.
    if (args.administrativeBodyId !== undefined && args.administrativeBodyId !== current.administrativeBodyId) {
        if (args.administrativeBodyId === null) {
            await requireCityAdmin(identity, args.cityId);
        } else {
            await requireBodyAdmin(identity, args.cityId, args.administrativeBodyId);
        }
    }
    if (args.administrativeBodyId) {
        await requireCityBodies(args.cityId, [args.administrativeBodyId]);
    }

    const edit: MeetingDetailsEdit = {
        ...(args.dateTime !== undefined && { dateTime: new Date(args.dateTime) }),
        ...(args.youtubeUrl !== undefined && { youtubeUrl: args.youtubeUrl }),
        ...(args.agendaUrl !== undefined && { agendaUrl: args.agendaUrl }),
        ...(args.administrativeBodyId !== undefined && { administrativeBodyId: args.administrativeBodyId }),
        ...pickRecordInput(args),
    };
    if (Object.keys(edit).length === 0) {
        throw new BadRequestError('Nothing to update: pass at least one field to change.');
    }

    const meeting = await updateMeetingWithEffects(args.cityId, args.meetingId, edit);
    const timezone = await getCityTimezone(meeting.cityId);

    return {
        id: meeting.id,
        cityId: meeting.cityId,
        name: meetingLabel(meeting, 'el', timezone),
        title: meetingDisplayName(meeting, 'el', timezone),
        name_en: meetingLabel(meeting, 'en', timezone),
        dateTime: meeting.dateTime.toISOString(),
        youtubeUrl: meeting.youtubeUrl,
        agendaUrl: meeting.agendaUrl,
        administrativeBody: meeting.administrativeBody?.name ?? null,
        released: meeting.released,
        url: meetingUrl(meeting.cityId, meeting.id),
    };
}

const TASK_NOTIFICATIONS_NOTE = 'processAgenda and summarize email the subscribers when they succeed, only for a released '
    + 'meeting that is still news. get_meeting\'s `notifications` says what they would do now.';

export async function mcpStartTask(identity: McpIdentity, args: StartTaskToolArgs) {
    const { cityId, meetingId, ...request } = args;
    await requireMeetingAdmin(identity, cityId, meetingId);
    await requireVisibleMeeting(cityId, meetingId, identity);

    const task = await startMeetingTask(cityId, meetingId, request);

    return {
        ...mcpTaskSummary({ ...task, error: null }),
        cityId,
        meetingId,
        // The transcribe core stores the video it was given on the meeting.
        ...(request.type === 'transcribe' && request.videoUrl && { youtubeUrl: request.videoUrl }),
        url: meetingUrl(cityId, meetingId),
        // Fixed text, not a read of the meeting: the job is already submitted, and the
        // agent decides before it starts, from get_meeting's live `notifications`.
        ...(isNewsPhase(request.type) && { notifications: TASK_NOTIFICATIONS_NOTE }),
        next: 'The task runs on the task server and takes minutes. Poll get_meeting: its `tasks` list '
            + 'carries the status, and a failed task carries the error.',
    };
}

/** The agenda formats that the task server reads (documentConversion in opencouncil-tasks). */
const AGENDA_CONTENT_TYPES = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const satisfies Record<AgendaUploadUrlToolArgs['format'], string>;
const AGENDA_UPLOAD_URL_SECONDS = 300;

export async function mcpCreateAgendaUploadUrl(identity: McpIdentity, args: AgendaUploadUrlToolArgs) {
    await requireCityAdmin(identity, args.cityId);
    await requireRealmCity(args.cityId);

    const contentType = AGENDA_CONTENT_TYPES[args.format];
    // A random suffix in place of the collision loop of the upload route: the
    // name stays readable in the bucket, and needs no lookup.
    const key = `uploads/${args.cityId}_${args.identifier}_agenda_${crypto.randomUUID().slice(0, 8)}.${args.format}`;
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

export async function mcpCreateCity(identity: McpIdentity, args: CreateCityToolArgs) {
    await requireSuperadmin(identity);

    // The city goes to the connector's realm unless the superadmin names
    // another. The fields a tool does not offer take the defaults of the
    // site's form, and `pending` keeps the city off every public page.
    const realm = args.realm ?? currentRealm();
    // A realm that serves the English UI has no default content language:
    // its councils do not meet in English.
    const realmLanguage = cityLanguageSchema.safeParse(REALMS[realm].defaultLocale);
    const language = args.language ?? (realmLanguage.success ? realmLanguage.data : undefined);
    if (!language) {
        throw new BadRequestError(
            `The ${realm} realm has no default content language. Pass "language", the language the council meets in: one of ${Object.values(CityLanguage).join(', ')}. A council that meets in another language cannot be added yet.`,
        );
    }
    const city = await createCityOrConflict({
        ...CITY_DEFAULTS,
        id: args.id,
        name: args.name,
        name_en: args.name_en,
        name_municipality: args.name_municipality,
        name_municipality_en: args.name_municipality_en,
        timezone: args.timezone,
        authorityType: args.authorityType,
        language,
        realm,
        logoImage: null,
        wikipediaId: null,
        diavgeiaUid: null,
        population: null,
    });

    // The old id list is a 404 for the URL this answer carries, so the next
    // request must not be served from it.
    revalidateAfterResponse({ blockingTags: ['cities:all'] });

    rememberCityRealm(city.id, city.realm);
    return {
        id: city.id,
        name: city.name,
        status: city.status,
        realm: city.realm,
        language: city.language,
        url: `${cityBaseUrl(city.id)}/${city.id}`,
        next: 'The city is saved as pending, so it is not public. Fill it with populate_city. '
            + `Add the logo and the boundary on the site: ${currentBaseUrl()}/admin/cities.`,
    };
}

/**
 * Every realm, for a superadmin who adds a city: where each one is served,
 * which UI language it shows, and how many cities it has in each status.
 */
export async function mcpListRealms(identity: McpIdentity) {
    await requireSuperadmin(identity);
    const counts = await countCitiesByRealmAndStatus();
    const cityCount = (realm: string, status: string) =>
        counts.find((row) => row.realm === realm && row.status === status)?._count._all ?? 0;
    return {
        realms: ALL_REALMS.map((realm) => ({
            realm,
            country: REALMS[realm].country,
            countryName: getRealmDisplayName(realm, 'en'),
            domain: REALMS[realm].domain,
            uiLanguage: REALMS[realm].defaultLocale,
            stage: REALMS[realm].stage,
            thisConnection: realm === currentRealm(),
            cities: {
                supported: cityCount(realm, 'supported'),
                demo: cityCount(realm, 'demo'),
                pending: cityCount(realm, 'pending'),
            },
        })),
        next: 'Pass a realm to create_city to add a city there, and to list_cities (with includePending) to see its cities. '
            + 'The UI language is the site\'s; the language a council speaks is set per city.',
    };
}

export async function mcpPopulateCity(
    identity: McpIdentity,
    data: CityPopulationData
) {
    await requireSuperadmin(identity);
    await requireRealmCity(data.cityId);

    const stats = await populateCity(data);
    revalidateAfterResponse({ tags: [`city:${data.cityId}`] });

    return {
        cityId: data.cityId,
        ...stats,
        url: `${cityBaseUrl(data.cityId)}/${data.cityId}`,
        next: 'The city stays pending. A superadmin checks the import and sets the status on the site.',
    };
}
