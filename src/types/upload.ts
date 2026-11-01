/**
 * The files that a person or an assistant uploads straight to our bucket, for
 * a meeting: what each kind accepts, how its file is named, and who may
 * upload it. The browser's drop zone, its upload routes and the MCP upload
 * tools all read this one table.
 */
import { LOGO_IMAGE_TYPES } from '@/lib/utils/imageUpload';
import type * as z from 'zod';
import type { AuthorizationScope } from '@/lib/auth';
import type { uploadConfigSchema } from '@/lib/zod-schemas/upload';

/** Content types accepted for logo uploads (cities, parties); the reason for the set is with the list. */
export const ALLOWED_LOGO_CONTENT_TYPES = LOGO_IMAGE_TYPES;

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/** The formats a meeting file can take. The extension names the format of a picked or dropped file. */
export const UPLOAD_FORMATS = {
    pdf: { contentType: 'application/pdf', extension: 'pdf' },
    docx: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' },
    mp4: { contentType: 'video/mp4', extension: 'mp4' },
    mov: { contentType: 'video/quicktime', extension: 'mov' },
} as const;
export type UploadFormat = keyof typeof UPLOAD_FORMATS;

/**
 * The meeting files, the formats the task server reads for each, and their
 * size limits.
 * - agenda: processAgenda reads a PDF or a .docx (documentConversion in
 *   opencouncil-tasks). It refuses a legacy .doc: convert one to PDF first.
 * - decision: the decision reading reads a PDF.
 * - recording: the task server remuxes the video into an mp4 with the video
 *   stream copied, which an mp4 or a QuickTime file allows.
 * A PDF reaches Claude base64-encoded, in a request of at most 32 MB, so the
 * task server stops at 20 MiB (MAX_DOCUMENT_BYTES). A recording of a whole
 * day of sittings at 1080p stays well under 40 GiB.
 */
export const UPLOAD_KINDS = {
    agenda: { formats: ['pdf', 'docx'], maxBytes: 20 * MiB },
    decision: { formats: ['pdf'], maxBytes: 20 * MiB },
    recording: { formats: ['mp4', 'mov'], maxBytes: 40 * GiB },
} as const satisfies Record<string, { formats: readonly UploadFormat[]; maxBytes: number }>;
export type UploadKind = keyof typeof UPLOAD_KINDS;

/** The names of the kinds and formats, as the non-empty tuples a zod enum takes. */
export const UPLOAD_KIND_NAMES = Object.keys(UPLOAD_KINDS) as [UploadKind, ...UploadKind[]];
export const UPLOAD_FORMAT_NAMES = Object.keys(UPLOAD_FORMATS) as [UploadFormat, ...UploadFormat[]];

/** The format of a file of this kind, read from its name; null when the kind does not take it. */
export function uploadFormatOfFile(kind: UploadKind, filename: string): UploadFormat | null {
    const extension = filename.toLowerCase().split('.').pop();
    const formats: readonly UploadFormat[] = UPLOAD_KINDS[kind].formats;
    return formats.find(format => UPLOAD_FORMATS[format].extension === extension) ?? null;
}

/** The `accept` list of a file input for this kind: the extensions and the content types it takes. */
export function uploadAccept(kind: UploadKind): string {
    return UPLOAD_KINDS[kind].formats
        .flatMap(format => [`.${UPLOAD_FORMATS[format].extension}`, UPLOAD_FORMATS[format].contentType])
        .join(',');
}

export type UploadConfig = z.output<typeof uploadConfigSchema>;

/** How a client sends a file to the bucket: startUpload in lib/uploads makes it. */
export interface UploadPlan {
    key: string
    /** Where the file is, once uploaded. */
    publicUrl: string
    method: 'PUT'
    /** The headers that every PUT must send, exactly as given. */
    headers: Record<string, string>
    /** The size of every part but the last one, which takes the rest of the file. */
    partSize: number
    parts: { partNumber: number; uploadUrl: string }[]
    expiresIn: number
    /** What completeUpload needs after the parts. Null for one PUT, which needs nothing more. */
    completion: { uploadId: string; token: string } | null
}

/**
 * The readable parts of the name of an upload, `{cityId}_{bodyId}_{identifier}_{kind}`,
 * before the random part that keeps every key new.
 *
 * The name follows the scope that authorized the upload (#828). A file for an
 * existing meeting is named after that meeting, whatever identifier the
 * caller sent: an admin of one body must not get a key that names a meeting
 * of another body. A file for a meeting that does not exist yet carries the
 * id of its body, so two bodies never share a name for the same date.
 */
export function uploadNameParts(config: UploadConfig): string[] {
    return [
        config.cityId,
        !config.councilMeetingId && config.administrativeBodyId ? config.administrativeBodyId : undefined,
        config.councilMeetingId ?? config.identifier,
        config.kind,
    ].filter((part): part is string => Boolean(part));
}

/**
 * Who may upload under a config: a city admin, the editors of the meeting
 * when the config names one, and the admins of the body when it names a body
 * for a meeting not yet created.
 */
export function uploadAuthorizationScope(config: UploadConfig): AuthorizationScope {
    if (config.councilMeetingId) return { cityId: config.cityId, councilMeetingId: config.councilMeetingId }
    if (config.administrativeBodyId) return { cityId: config.cityId, administrativeBodyId: config.administrativeBodyId }
    return { cityId: config.cityId }
}
