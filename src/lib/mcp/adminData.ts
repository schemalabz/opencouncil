import "server-only";
import { Prisma, type City } from '@prisma/client';
import { env } from '@/env.mjs';
import prisma from '@/lib/db/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/api/errors';
import { createCityDirect } from '@/lib/db/citiesAdmin';
import { populateCity, type CityPopulationData } from '@/lib/db/cityPopulate';
import { createMeetingWithEffects, updateMeetingWithEffects, type MeetingDetailsEdit } from '@/lib/meetingWrites';
import { pickRecordInput } from '@/lib/meetingLifecycleRules';
import { startMeetingTask } from '@/lib/tasks/startMeetingTask';
import { constructPublicUrl, generatePresignedUrl } from '@/lib/s3';
import { listTranscriptEdits, revertTranscriptEdit } from '@/lib/db/utteranceEdits';
import { revalidateAfterResponse } from '@/lib/cache/afterResponse';
import { CITY_DEFAULTS } from '@/lib/zod-schemas/city';
import { REALMS } from '@/lib/realm';
import type { McpIdentity } from './auth';
import type {
    AgendaUploadUrlToolArgs,
    CreateCityToolArgs,
    CreateMeetingToolArgs,
    DocumentUploadUrlToolArgs,
    ListTranscriptEditsToolArgs,
    RevertTranscriptEditToolArgs,
    StartTaskToolArgs,
    UpdateMeetingToolArgs,
} from './adminToolSchemas';
import { requireBodyAdmin, requireCityAdmin, requireMeetingAdmin, requireSuperadmin } from './adminAccess';
import { requireVisibleMeeting } from './gate';
import { mcpTaskSummary } from './taskSummary';
import { requireCityBodies, requireRealmCity } from './realmGuards';
import { currentBaseUrl, currentRealm } from './realm-context';
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

const meetingUrl = (cityId: string, meetingId: string) => `${currentBaseUrl()}/${cityId}/${meetingId}`;

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
        municipalMinutesUrl: args.municipalMinutesUrl,
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
            + 'until it is released. '
            + (meeting.municipalMinutesUrl
                ? 'Start transcribe with start_task: fixTranscript, fixFromMinutes and summarize follow on their own, '
                    + 'and the meeting needs no human review. Release is done on the site, on the admin page of the meeting.'
                : 'Transcription and release are done on the site, on the admin page of the meeting.'),
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
        ...(args.municipalMinutesUrl !== undefined && { municipalMinutesUrl: args.municipalMinutesUrl }),
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
        municipalMinutesUrl: meeting.municipalMinutesUrl,
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
        // So does the fixFromMinutes core with the minutes it was given.
        ...(request.type === 'fixFromMinutes' && request.municipalMinutesUrl && { municipalMinutesUrl: request.municipalMinutesUrl }),
        url: meetingUrl(cityId, meetingId),
        // Fixed text, not a read of the meeting: the job is already submitted, and the
        // agent decides before it starts, from get_meeting's live `notifications`.
        ...(isNewsPhase(request.type) && { notifications: TASK_NOTIFICATIONS_NOTE }),
        next: 'The task runs on the task server and takes minutes. Poll get_meeting: its `tasks` list '
            + 'carries the status, and a failed task carries the error.',
    };
}

/** The document formats that the task server reads (documentConversion in opencouncil-tasks). */
const DOCUMENT_CONTENT_TYPES = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const satisfies Record<DocumentUploadUrlToolArgs['format'], string>;
/** What a document is to a meeting: the suffix of its file name, and the field it goes to. */
const DOCUMENT_KINDS = {
    agenda: { suffix: 'agenda', field: 'agendaUrl' },
    municipalMinutes: { suffix: 'municipal-minutes', field: 'municipalMinutesUrl' },
} as const satisfies Record<DocumentUploadUrlToolArgs['kind'], { suffix: string; field: string }>;
const DOCUMENT_UPLOAD_URL_SECONDS = 300;

export async function mcpCreateDocumentUploadUrl(identity: McpIdentity, args: DocumentUploadUrlToolArgs) {
    await requireCityAdmin(identity, args.cityId);
    await requireRealmCity(args.cityId);

    const contentType = DOCUMENT_CONTENT_TYPES[args.format];
    const { suffix, field } = DOCUMENT_KINDS[args.kind];
    // A random suffix in place of the collision loop of the upload route: the
    // name stays readable in the bucket, and needs no lookup.
    const key = `uploads/${args.cityId}_${args.identifier}_${suffix}_${crypto.randomUUID().slice(0, 8)}.${args.format}`;
    const uploadUrl = await generatePresignedUrl(key, contentType, DOCUMENT_UPLOAD_URL_SECONDS);

    // Spaces ignores the ACL that the signature carries in the query string:
    // the PUT must send it as a header, or the file stays private.
    return {
        uploadUrl,
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'x-amz-acl': 'public-read' },
        expiresIn: DOCUMENT_UPLOAD_URL_SECONDS,
        publicUrl: constructPublicUrl(env.DO_SPACES_BUCKET, key),
        next: 'Send the file with a PUT to uploadUrl, with exactly these headers, within expiresIn seconds. '
            + 'Without the x-amz-acl header the file stays private. '
            + `Then pass publicUrl as ${field} to create_meeting or update_meeting.`,
    };
}

/** The agenda upload tool of earlier releases: the same call with kind agenda. */
export function mcpCreateAgendaUploadUrl(identity: McpIdentity, args: AgendaUploadUrlToolArgs) {
    return mcpCreateDocumentUploadUrl(identity, { ...args, kind: 'agenda' });
}

// --- Transcript edits ----------------------------------------------------

/** What a listed edit carries, with the moment in the recording to open. */
function describeEdit(cityId: string, meetingId: string, edit: Awaited<ReturnType<typeof listTranscriptEdits>>[number]) {
    return {
        ...edit,
        createdAt: edit.createdAt.toISOString(),
        url: `${meetingUrl(cityId, meetingId)}/transcript?t=${Math.floor(edit.startTimestamp)}`,
    };
}

export async function mcpListTranscriptEdits(identity: McpIdentity, args: ListTranscriptEditsToolArgs) {
    await requireMeetingAdmin(identity, args.cityId, args.meetingId);
    await requireVisibleMeeting(args.cityId, args.meetingId, identity);
    const edits = await listTranscriptEdits(args.cityId, args.meetingId, args.taskId);
    return {
        cityId: args.cityId,
        meetingId: args.meetingId,
        count: edits.length,
        edits: edits.map(edit => describeEdit(args.cityId, args.meetingId, edit)),
    };
}

export async function mcpRevertTranscriptEdit(identity: McpIdentity, args: RevertTranscriptEditToolArgs) {
    await requireMeetingAdmin(identity, args.cityId, args.meetingId);
    await requireVisibleMeeting(args.cityId, args.meetingId, identity);
    const userId = identity?.type === 'user' ? identity.userId : null;
    const revert = await revertTranscriptEdit(args.cityId, args.meetingId, args.editId, userId);
    revalidateAfterResponse({ tags: [`city:${args.cityId}:meetings`] });
    return {
        ...describeEdit(args.cityId, args.meetingId, revert),
        next: 'The text from before the edit is back, recorded as your edit. The speaker of the utterance is unchanged.',
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
