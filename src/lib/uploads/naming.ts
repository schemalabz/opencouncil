import "server-only";
import { v4 as uuidv4 } from 'uuid'
import { env } from '@/env.mjs'
import { fileExists } from '@/lib/s3'
import { UploadConfig } from '@/types/upload'

/** The folder of the bucket that holds the files that administrators upload. */
export const UPLOADS_PREFIX = 'uploads'

/**
 * Generate a meaningful filename based on upload config
 * Pattern: {cityId}_{identifier}_{suffix}.{ext}
 * Examples:
 *   - chania_aug15_2025_recording.mp4
 *   - chania_aug15_2025_agenda.pdf
 *   - chania_democrats_logo.png
 */
export function generateBaseFilename(config: UploadConfig | undefined, extension: string): string {
    const parts = [
        config?.cityId,
        config?.identifier,
        config?.suffix
    ].filter(Boolean)

    return parts.length > 0
        ? `${parts.join('_')}.${extension}`
        : `${uuidv4()}.${extension}`
}

/**
 * Find an available filename by adding numeric suffixes if needed
 * e.g., file.pdf -> file.pdf, file_2.pdf, file_3.pdf, etc.
 */
export async function findAvailableFilename(baseFilename: string, prefix: string = UPLOADS_PREFIX): Promise<string> {
    const key = `${prefix}/${baseFilename}`

    // Check if base filename is available
    if (!await fileExists(env.DO_SPACES_BUCKET, key)) {
        return baseFilename
    }

    // Extract name and extension
    const lastDotIndex = baseFilename.lastIndexOf('.')
    const nameWithoutExt = lastDotIndex > 0 ? baseFilename.substring(0, lastDotIndex) : baseFilename
    const extension = lastDotIndex > 0 ? baseFilename.substring(lastDotIndex) : ''

    // Try with numeric suffixes
    let counter = 2
    while (counter <= 10) { // Limit to 10 attempts
        const newFilename = `${nameWithoutExt}_${counter}${extension}`
        const newKey = `${prefix}/${newFilename}`

        if (!await fileExists(env.DO_SPACES_BUCKET, newKey)) {
            return newFilename
        }

        counter++
    }

    // If we've exhausted all numeric attempts, fall back to clean UUID-based name
    const cleanUuidName = `${uuidv4()}${extension}`
    return cleanUuidName
}

/** The bucket key for a new upload: the name the config gives, made unique in the uploads folder. */
export async function availableUploadKey(config: UploadConfig | undefined, extension: string): Promise<string> {
    const filename = await findAvailableFilename(generateBaseFilename(config, extension), UPLOADS_PREFIX)
    return `${UPLOADS_PREFIX}/${filename}`
}
