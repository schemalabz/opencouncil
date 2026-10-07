// Server-only: no auth check. The caller authorizes first — the MCP admin
// tools do, for an administrator of the city.
import "server-only";
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { env } from '@/env.mjs'
import { BadRequestError } from '@/lib/api/errors'
import { constructPublicUrl, s3Client } from '@/lib/s3'
import { availableUploadKey } from './naming'

const MAX_AGENDA_BYTES = 50 * 1024 * 1024
const FETCH_TIMEOUT_MS = 30_000

type AgendaFormat = { extension: 'pdf' | 'docx'; contentType: string }

const PDF: AgendaFormat = { extension: 'pdf', contentType: 'application/pdf' }
const DOCX: AgendaFormat = {
    extension: 'docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

/**
 * The task server reads only PDF and .docx (fetchAgendaDocument in
 * opencouncil-tasks). The bytes decide, not the headers: municipality sites
 * often serve a PDF as application/octet-stream.
 */
export function detectAgendaFormat(body: Buffer): AgendaFormat | null {
    if (body.subarray(0, 1024).includes('%PDF-')) return PDF
    // A .docx is a zip archive, and a zip stores its file names uncompressed.
    if (body.subarray(0, 4).equals(Buffer.from('PK\x03\x04', 'latin1')) && body.includes('word/document.xml')) {
        return DOCX
    }
    return null
}

export function isInOurStorage(url: string): boolean {
    return url.startsWith(constructPublicUrl(env.DO_SPACES_BUCKET, ''))
        || url.startsWith(`${env.CDN_URL}/`)
}

async function downloadAgenda(sourceUrl: string): Promise<{ body: Buffer; format: AgendaFormat }> {
    const { protocol } = new URL(sourceUrl)
    if (protocol !== 'https:' && protocol !== 'http:') {
        throw new BadRequestError(`The agenda URL must use http or https, not ${protocol}`)
    }

    let response: Response
    try {
        response = await fetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    } catch (error) {
        throw new BadRequestError(
            `Could not download the agenda from ${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`
        )
    }
    if (!response.ok) {
        throw new BadRequestError(`Could not download the agenda from ${sourceUrl}: HTTP ${response.status}`)
    }
    if (Number(response.headers.get('content-length') ?? 0) > MAX_AGENDA_BYTES) {
        throw new BadRequestError(`The agenda at ${sourceUrl} is larger than ${MAX_AGENDA_BYTES / 1024 / 1024} MB`)
    }

    const body = Buffer.from(await response.arrayBuffer())
    if (body.length > MAX_AGENDA_BYTES) {
        throw new BadRequestError(`The agenda at ${sourceUrl} is larger than ${MAX_AGENDA_BYTES / 1024 / 1024} MB`)
    }

    const format = detectAgendaFormat(body)
    if (!format) {
        const contentType = response.headers.get('content-type') ?? 'unknown'
        throw new BadRequestError(
            `The agenda at ${sourceUrl} is not a PDF or a .docx file (content type: ${contentType}). `
            + 'Agenda processing reads only these two formats. If the agenda is a web page, find the link to '
            + 'its PDF, or save the page as a PDF and upload it on the admin page of the meeting.'
        )
    }
    return { body, format }
}

/**
 * Copy an agenda into our bucket under the name that an upload on the admin
 * page gets, and return the public URL of the copy. A municipality can remove
 * or move its file later; the copy stays. A URL that is already in our bucket
 * comes back as it is.
 */
export async function copyAgendaToStorage(cityId: string, meetingId: string, sourceUrl: string): Promise<string> {
    if (isInOurStorage(sourceUrl)) return sourceUrl

    const { body, format } = await downloadAgenda(sourceUrl)
    const key = await availableUploadKey({ cityId, identifier: meetingId, suffix: 'agenda' }, format.extension)

    await s3Client.send(new PutObjectCommand({
        Bucket: env.DO_SPACES_BUCKET,
        Key: key,
        Body: body,
        ContentType: format.contentType,
        ACL: 'public-read',
    }))

    return constructPublicUrl(env.DO_SPACES_BUCKET, key)
}
