import prisma from '@/lib/db/prisma';

/**
 * Generate a meeting ID slug from a date.
 * Example: 2026-04-20 → "apr20_2026"
 *
 * This logic was originally in AddMeetingForm (client-side).
 * Extracted here so it can be used server-side for auto-generation.
 */
export function formatDateAsMeetingId(date: Date): string {
    return date
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        .toLowerCase()
        .replace(/\s/g, '')
        .replace(',', '_');
}

/**
 * Generate a unique meeting ID for a city, handling collisions
 * by appending _2, _3, etc. (matches existing convention).
 */
export async function generateUniqueMeetingId(cityId: string, date: Date): Promise<string> {
    const baseId = formatDateAsMeetingId(date);

    // Fetch all existing meeting IDs with this base prefix in one query
    const existing = await prisma.councilMeeting.findMany({
        where: {
            cityId,
            id: { startsWith: baseId },
        },
        select: { id: true },
    });

    const existingIds = new Set(existing.map(m => m.id));

    if (!existingIds.has(baseId)) {
        return baseId;
    }

    for (let suffix = 2; suffix <= 20; suffix++) {
        const candidateId = `${baseId}_${suffix}`;
        if (!existingIds.has(candidateId)) {
            return candidateId;
        }
    }

    throw new Error(`Could not generate unique meeting ID for ${cityId} on ${baseId} — too many meetings on this date`);
}
