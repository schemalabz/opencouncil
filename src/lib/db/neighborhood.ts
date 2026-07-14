import prisma from './prisma';
import type { Prisma } from '@prisma/client';

/**
 * Real council subjects surfaced in the interactive neighbourhood illustration on
 * /explain. Each drawn element maps to a theme; for that theme we pick the most
 * discussed (by number of speaker contributions) recent subject from a released
 * meeting, so hovering a house/tree/lamp reveals an actual thing a council
 * debated.
 */
export interface NeighborhoodSubject {
    id: string;
    name: string;
    cityId: string;
    meetingId: string;
    /** Canonical subject page, e.g. /athens/jun24_2026/subjects/abc123 */
    url: string;
    cityName: string;
    /** Meeting date (ISO) — formatted at render time. */
    date: string;
    topicName: string | null;
    topicColor: string | null;
}

/** Which drawn element maps to which subject query. */
type ThemeQuery =
    | { key: string; topicId: string }
    | { key: string; nameContains: string };

const THEMES: ThemeQuery[] = [
    { key: 'trees', topicId: 'environment' },
    { key: 'school', topicId: 'education' },
    { key: 'store', topicId: 'cmoa4rgzd0007zhut2q64kxzl' }, // Εμπόριο & Καταστήματα
    { key: 'light', nameContains: 'φωτισμ' }, // no dedicated topic — match by name
    { key: 'trash', topicId: 'cleanliness-and-waste' },
];

async function findThemeSubject(theme: ThemeQuery): Promise<NeighborhoodSubject | null> {
    const where: Prisma.SubjectWhereInput = {
        withdrawn: false,
        councilMeeting: { released: true, city: { realm: 'greece' } },
        ...('topicId' in theme
            ? { topicId: theme.topicId }
            : { name: { contains: theme.nameContains, mode: 'insensitive' } }),
    };

    const subject = await prisma.subject.findFirst({
        where,
        orderBy: [
            { contributions: { _count: 'desc' } },
            { councilMeeting: { dateTime: 'desc' } },
        ],
        select: {
            id: true,
            name: true,
            cityId: true,
            councilMeetingId: true,
            topic: { select: { name: true, colorHex: true } },
            councilMeeting: { select: { dateTime: true, city: { select: { name: true } } } },
        },
    });

    if (!subject) return null;

    return {
        id: subject.id,
        name: subject.name,
        cityId: subject.cityId,
        meetingId: subject.councilMeetingId,
        url: `/${subject.cityId}/${subject.councilMeetingId}/subjects/${subject.id}`,
        cityName: subject.councilMeeting.city.name,
        date: subject.councilMeeting.dateTime.toISOString(),
        topicName: subject.topic?.name ?? null,
        topicColor: subject.topic?.colorHex ?? null,
    };
}

/**
 * Returns a map of element key -> subject (or null when nothing matches) for the
 * neighbourhood illustration. Keys: trees, school, store, light, trash.
 */
export async function getNeighborhoodSubjects(): Promise<Record<string, NeighborhoodSubject | null>> {
    const results = await Promise.all(
        THEMES.map(async (theme) => [theme.key, await findThemeSubject(theme)] as const),
    );
    return Object.fromEntries(results);
}
