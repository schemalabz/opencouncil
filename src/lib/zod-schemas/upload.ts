import * as z from 'zod';
import { UPLOAD_KIND_NAMES } from '@/types/upload';

/** The exact size of the file, in bytes. It decides whether the file goes up in one PUT or in parts. */
export const uploadSizeBytes = z.number().int().positive();

/** What a meeting file is for. It names the file and decides who may upload it (uploadAuthorizationScope). */
export const uploadConfigSchema = z.object({
    cityId: z.string().min(1),
    kind: z.enum(UPLOAD_KIND_NAMES),
    /** Names the file, e.g. the meeting id or the date of a meeting not yet created. */
    identifier: z.string().min(1).optional(),
    /** The body of the meeting, so that an admin of that body may upload before the meeting row exists. */
    administrativeBodyId: z.string().min(1).optional(),
    /** The existing meeting. It takes precedence over the body: the editors of the meeting may upload. */
    councilMeetingId: z.string().min(1).optional(),
});

/** POST /api/upload/start: the browser names the file; its extension gives the format. */
export const startUploadRequestSchema = z.object({
    filename: z.string().min(1),
    sizeBytes: uploadSizeBytes,
    config: uploadConfigSchema,
});

/** What completes an upload in parts: the fields that the start returned, and the declared size. */
export const completeUploadRequestSchema = z.object({
    key: z.string().min(1),
    uploadId: z.string().min(1),
    token: z.string().min(1),
    sizeBytes: uploadSizeBytes,
});
export type CompleteUploadRequest = z.output<typeof completeUploadRequestSchema>;
