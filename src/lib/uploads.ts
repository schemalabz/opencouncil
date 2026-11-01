import "server-only";
import { env } from '@/env.mjs';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { mintHmacToken, verifyHmacToken } from '@/lib/hmacToken';
import {
    completeMultipartUpload, constructPublicUrl, listUploadedParts, objectKey, objectSize, presignPart, presignPut,
    startMultipartUpload, type UploadedPart,
} from '@/lib/s3';
import { isS3NotFound } from '@opencouncil/subject-images/store';
import {
    UPLOAD_FORMATS, UPLOAD_KINDS, uploadNameParts, type UploadConfig, type UploadFormat, type UploadKind, type UploadPlan,
} from '@/types/upload';
import type { CompleteUploadRequest } from '@/lib/zod-schemas/upload';

/**
 * A direct upload of a meeting file, for the browser and for an MCP client
 * alike. The caller authorizes the config first; these functions check the
 * file against its kind, name it, and sign the URLs.
 *
 * A file of one part goes up in one PUT, which makes it public itself. A
 * bigger file goes up in parts, and the upload ends with completeUpload,
 * which joins them. One part is at most 1 GiB: few enough URLs for an
 * assistant to copy, and small enough for a browser to send again.
 */
export const UPLOAD_PART_BYTES = 1024 * 1024 * 1024;
/** A single PUT starts right after the request for it. */
const SINGLE_PUT_SECONDS = 300;
/** The last part of a big file can start hours after the first one, on a slow line. */
const PART_URL_SECONDS = 12 * 60 * 60;

const COMPLETION_DOMAIN = 'upload-complete:';
/** The token binds the size too, so a caller cannot complete with fewer bytes than it declared. */
const completionValue = (key: string, uploadId: string, sizeBytes: number) => `${key}\n${uploadId}\n${sizeBytes}`;

/** A size limit as a person reads it; the limits are whole MiB or GiB. */
const readableBytes = (bytes: number) =>
    bytes >= 1024 ** 3 ? `${bytes / 1024 ** 3} GiB` : `${bytes / 1024 ** 2} MiB`;

/** The refusal of a file that its kind does not take; `got` is its format or its extension. */
export function formatRefusal(kind: UploadKind, got: string): BadRequestError {
    return new BadRequestError(`An upload of kind ${kind} takes ${UPLOAD_KINDS[kind].formats.join(' or ')}, not ${got}`);
}

export async function startUpload(config: UploadConfig, format: UploadFormat, sizeBytes: number): Promise<UploadPlan> {
    const kind = UPLOAD_KINDS[config.kind];
    const formats: readonly UploadFormat[] = kind.formats;
    if (!formats.includes(format)) throw formatRefusal(config.kind, format);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > kind.maxBytes) {
        throw new BadRequestError(`An upload of kind ${config.kind} takes at most ${readableBytes(kind.maxBytes)} `
            + `(${kind.maxBytes} bytes), not ${sizeBytes} bytes`);
    }

    const { contentType, extension } = UPLOAD_FORMATS[format];
    const key = objectKey('uploads', uploadNameParts(config), extension);
    const publicUrl = constructPublicUrl(env.DO_SPACES_BUCKET, key);

    if (sizeBytes <= UPLOAD_PART_BYTES) {
        return {
            key, publicUrl, method: 'PUT',
            headers: { 'Content-Type': contentType, 'x-amz-acl': 'public-read' },
            partSize: sizeBytes,
            parts: [{ partNumber: 1, uploadUrl: await presignPut(key, contentType, sizeBytes, SINGLE_PUT_SECONDS) }],
            expiresIn: SINGLE_PUT_SECONDS,
            completion: null,
        };
    }

    const uploadId = await startMultipartUpload(key, contentType);
    const partCount = Math.ceil(sizeBytes / UPLOAD_PART_BYTES);
    const partNumbers = Array.from({ length: partCount }, (_, i) => i + 1);
    return {
        key, publicUrl, method: 'PUT',
        headers: {},
        partSize: UPLOAD_PART_BYTES,
        parts: await Promise.all(partNumbers.map(async partNumber => ({
            partNumber,
            uploadUrl: await presignPart(key, uploadId, partNumber, partBytes(partNumber, partCount, sizeBytes), PART_URL_SECONDS),
        }))),
        expiresIn: PART_URL_SECONDS,
        completion: { uploadId, token: mintHmacToken(COMPLETION_DOMAIN, completionValue(key, uploadId, sizeBytes)) },
    };
}

/** The size of a part: the part size, or the rest of the file for the last part. */
const partBytes = (partNumber: number, partCount: number, sizeBytes: number) =>
    partNumber < partCount ? UPLOAD_PART_BYTES : sizeBytes - (partCount - 1) * UPLOAD_PART_BYTES;

/**
 * Why the uploaded parts do not make up the declared file, or null when they
 * do. The signed URLs already refuse a part of another size; this check also
 * catches a part that never arrived.
 */
export function partsProblem(parts: UploadedPart[], sizeBytes: number): string | null {
    const expected = Math.ceil(sizeBytes / UPLOAD_PART_BYTES);
    const present = new Set(parts.map(part => part.partNumber));
    const missing = Array.from({ length: expected }, (_, i) => i + 1).filter(n => !present.has(n));
    if (missing.length > 0) {
        return missing.length === 1
            ? `Part ${missing[0]} of ${expected} is missing. Send it, then complete again.`
            : `Parts ${missing.join(', ')} of ${expected} are missing. Send them, then complete again.`;
    }
    if (parts.length > expected) return `The upload holds ${parts.length} parts, more than the ${expected} of the file.`;
    const wrong = parts.filter(part => part.size !== partBytes(part.partNumber, expected, sizeBytes));
    if (wrong.length > 0) {
        const named = wrong.length === 1
            ? `Part ${wrong[0].partNumber} has the wrong size`
            : `Parts ${wrong.map(part => part.partNumber).join(', ')} have the wrong size`;
        return `${named}. Each part but the last holds ${UPLOAD_PART_BYTES} bytes. Send ${wrong.length === 1 ? 'it' : 'them'} `
            + 'again, then complete again.';
    }
    return null;
}

/**
 * Joins the parts of a multipart upload into the file. The token proves that
 * startUpload issued this key, upload and size, after its caller authorized
 * them. The parts must make up exactly the declared size: a part that did not
 * arrive would otherwise give a file with a gap. A second call after a
 * completed upload finds the file and answers as the first one did.
 */
export async function completeUpload(args: CompleteUploadRequest) {
    const { key, uploadId, sizeBytes, token } = args;
    if (!verifyHmacToken(COMPLETION_DOMAIN, completionValue(key, uploadId, sizeBytes), token)) {
        throw new ForbiddenError('This token does not belong to this upload');
    }
    const done = { key, publicUrl: constructPublicUrl(env.DO_SPACES_BUCKET, key), sizeBytes };

    try {
        const parts = await listUploadedParts(key, uploadId);
        const problem = partsProblem(parts, sizeBytes);
        if (problem) throw new BadRequestError(problem);
        await completeMultipartUpload(key, uploadId, parts);
        return done;
    } catch (error) {
        if (!isS3NotFound(error)) throw error;
        // Another caller can complete after this call lists the parts.
        if (await objectSize(key) === sizeBytes) return done;
        throw new NotFoundError('The bucket has no open upload with this id, and no file of this size under the key');
    }
}
