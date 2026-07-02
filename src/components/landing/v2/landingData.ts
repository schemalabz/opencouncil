/**
 * Data types and helpers for the landing redesign — thin client-side view models
 * over the real APIs:
 *   GET /api/map/subjects      → MapSubject[]   (geo-located subjects, last 6 months)
 *   GET /api/cities            → LandingCity[]  (listed cities with counts)
 *   GET /api/meetings/upcoming → UpcomingMeeting[]
 *   GET /api/topics            → Topic[]        (via useTopics())
 */

import type { AdministrativeBodyType } from '@prisma/client';
import { stripReferences } from '@/lib/utils/references';

/** Row returned by GET /api/map/subjects (see src/app/api/map/subjects/route.ts). */
export type MapSubject = {
    id: string;
    name: string;
    description: string;
    cityId: string;
    councilMeetingId: string;
    meetingDate?: string;
    meetingName?: string;
    bodyName?: string | null;
    /** administrative body type (council/committee/community) — drives ranking */
    adminBodyType?: AdministrativeBodyType | null;
    locationText?: string;
    locationType?: string;
    topicId?: string | null;
    topicName?: string;
    topicColor: string;
    topicIcon?: string | null;
    discussionTimeSeconds?: number;
    speakerCount?: number;
    geometry: GeoJSON.Geometry;
};

/** Subset of GET /api/cities (CityWithCounts, JSON-serialized) that the landing uses. */
export type LandingCity = {
    id: string;
    name: string;
    name_en: string;
    name_municipality: string;
    logoImage: string | null;
    _count: { persons: number; parties: number; councilMeetings: number };
};

/** Subset of GET /api/meetings/upcoming (UpcomingMeetingWithCity, JSON-serialized). */
export type UpcomingMeeting = {
    id: string;
    cityId: string;
    name: string;
    dateTime: string;
    city: { id: string; name: string; name_municipality: string; logoImage: string | null };
    administrativeBody: { name: string } | null;
};

/** GET /api/map/cities — a cooperating municipality with its centroid + logo, for the
 *  "Municipalities map" mode (one logo marker per δήμος, click → its city page). */
export type LandingMapCity = {
    id: string;
    name: string;
    nameMunicipality: string;
    logoImage: string | null;
    lng: number;
    lat: number;
    /** simplified boundary, for the orange outline of participating municipalities */
    geometry: GeoJSON.Geometry | null;
};

/** The topic accent shown on chips, pins and cards. */
export type SubjectTopic = { name: string; color: string; icon: string | null };

/** Display model for one geo-located subject on the landing map/lists. */
export type LandingSubject = {
    id: string;
    title: string;
    summary: string;
    cityId: string;
    cityName: string;
    /** the municipality in "Δήμος X" form, shown on cards when the subject has no address */
    nameMunicipality: string;
    /** the municipality's logo URL (shown on the subject card), or null */
    cityLogo: string | null;
    meetingId: string;
    lat: number;
    lng: number;
    /** meeting date as ISO string (missing for unscheduled data) */
    date: string | null;
    /** the street/area the subject refers to (Location.text) */
    where: string;
    /** the administrative body (όργανο) name, e.g. "Δημοτικό Συμβούλιο"; null when unknown */
    bodyName: string | null;
    /** the όργανο type (council/committee/community) — drives list ranking; null when unknown */
    adminBodyType: AdministrativeBodyType | null;
    topicId: string | null;
    topic: SubjectTopic;
    durationMin: number;
    speakers: number;
    /** among the most-discussed subjects → bigger pin, flame tag */
    hot: boolean;
    href: string;
};

/** GET /api/map/general-subjects — non-located subjects grouped per municipality, with
 *  the city centroid so the map can show one "general subjects" (city-hall) marker. */
export type GeneralSubjectRow = {
    id: string;
    name: string;
    description: string;
    cityId: string;
    councilMeetingId: string;
    meetingDate?: string;
    meetingName?: string;
    bodyName?: string | null;
    adminBodyType?: AdministrativeBodyType | null;
    topicId?: string | null;
    topicName?: string;
    topicColor: string;
    topicIcon?: string | null;
    discussionTimeSeconds?: number;
    speakerCount?: number;
};
export type GeneralCityRow = {
    cityId: string;
    cityName: string;
    lng: number;
    lat: number;
    subjects: GeneralSubjectRow[];
};

/** A municipality's non-located subjects, ready to render (subjects reuse LandingSubject,
 *  with lng/lat set to the city centroid and an empty `where`). `nameMunicipality` is the
 *  genitive form (e.g. "Δήμος Χαλανδρίου"). */
export type LandingGeneralCity = {
    cityId: string;
    cityName: string;
    nameMunicipality: string;
    lng: number;
    lat: number;
    subjects: LandingSubject[];
};

/** The municipality under the map center — drives the "view its page" button. */
export type CenterMunicipality = { id: string; name: string; nameMunicipality: string; officialSupport: boolean };
/** An out-of-network δήμος the visitor clicked on the map (shaded orange, "request it"). */
export type ClickedMunicipality = { id: string; name: string; geometry: GeoJSON.Geometry; lng: number; lat: number };
/** Open "co-located subjects" box — the subjects at one map point + its screen position. */
export type CoLocatedBox = { subjects: LandingSubject[]; x: number; y: number };
/** Open "general subjects" box — a municipality's non-located subjects + screen position. */
export type GeneralBox = { city: LandingGeneralCity; x: number; y: number };

export function toGeneralCities(
    rows: GeneralCityRow[],
    cityNames: Record<string, string>,
    municipalityNames: Record<string, string>,
    cityLogos: Record<string, string | null>,
    /** localized fallback topic name for subjects with no topic */
    generalLabel = 'Γενικά',
): LandingGeneralCity[] {
    return rows
        .filter((row) => isValidLngLat(row.lng, row.lat))
        .map((row) => ({
        cityId: row.cityId,
        cityName: cityNames[row.cityId] ?? row.cityName,
        nameMunicipality: municipalityNames[row.cityId] ?? cityNames[row.cityId] ?? row.cityName,
        lng: row.lng,
        lat: row.lat,
        subjects: row.subjects.map((s) => ({
            id: s.id,
            title: s.name,
            // descriptions may embed [text](REF:UTTERANCE:id) links — keep only the text
            summary: stripReferences(s.description),
            cityId: s.cityId,
            cityName: cityNames[s.cityId] ?? row.cityName,
            nameMunicipality: municipalityNames[s.cityId] ?? cityNames[s.cityId] ?? row.cityName,
            cityLogo: cityLogos[s.cityId] ?? null,
            meetingId: s.councilMeetingId,
            // no point of its own — anchored at the city centroid for the shared marker
            lat: row.lat,
            lng: row.lng,
            date: s.meetingDate ?? null,
            where: '',
            bodyName: s.bodyName ?? null,
            adminBodyType: s.adminBodyType ?? null,
            topicId: s.topicId ?? null,
            topic: { name: s.topicName ?? generalLabel, color: s.topicColor, icon: s.topicIcon ?? null },
            durationMin: Math.round((s.discussionTimeSeconds ?? 0) / 60),
            speakers: s.speakerCount ?? 0,
            hot: false,
            href: `/${s.cityId}/${s.councilMeetingId}/subjects/${s.id}`,
        })),
    }));
}

/** How many of the most-discussed subjects get the "πολυσυζητημένο" treatment. */
const HOT_COUNT = 3;

/** Guards against corrupt/out-of-range coordinates (e.g. an unswapped or projected point)
 *  that would otherwise crash Mapbox's setLngLat with "latitude must be between -90 and 90". */
export function isValidLngLat(lng: number, lat: number): boolean {
    return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

export function toLandingSubjects(
    rows: MapSubject[],
    cityNames: Record<string, string>,
    municipalityNames: Record<string, string>,
    cityLogos: Record<string, string | null>,
    /** localized fallback topic name for subjects with no topic */
    generalLabel = 'Γενικά',
): LandingSubject[] {
    const subjects = rows
        .filter((s): s is MapSubject & { geometry: GeoJSON.Point } => {
            if (s.geometry?.type !== 'Point') return false;
            const [lng, lat] = s.geometry.coordinates;
            return isValidLngLat(lng, lat);
        })
        .map((s) => {
            const [lng, lat] = s.geometry.coordinates;
            return {
                id: s.id,
                title: s.name,
                // descriptions may embed [text](REF:UTTERANCE:id) links — keep only the text
                summary: stripReferences(s.description),
                cityId: s.cityId,
                cityName: cityNames[s.cityId] ?? s.cityId,
                nameMunicipality: municipalityNames[s.cityId] ?? cityNames[s.cityId] ?? s.cityId,
                cityLogo: cityLogos[s.cityId] ?? null,
                meetingId: s.councilMeetingId,
                lat,
                lng,
                date: s.meetingDate ?? null,
                where: s.locationText ?? '',
                bodyName: s.bodyName ?? null,
                adminBodyType: s.adminBodyType ?? null,
                topicId: s.topicId ?? null,
                topic: { name: s.topicName ?? generalLabel, color: s.topicColor, icon: s.topicIcon ?? null },
                durationMin: Math.round((s.discussionTimeSeconds ?? 0) / 60),
                speakers: s.speakerCount ?? 0,
                hot: false,
                href: `/${s.cityId}/${s.councilMeetingId}/subjects/${s.id}`,
            };
        });

    [...subjects]
        .sort((a, b) => b.durationMin - a.durationMin)
        .slice(0, HOT_COUNT)
        .forEach((s) => {
            if (s.durationMin > 0) s.hot = true;
        });

    return subjects;
}

/** Popular free-text searches shown as suggestions when the search field is focused. */
export const SEARCH_KEYWORDS = [
    'Προϋπολογισμός',
    'Στάθμευση',
    'Πεζοδρόμηση',
    'Πράσινο & δέντρα',
    'Λαϊκές αγορές',
    'Αντιπλημμυρικά',
    'Σχολεία',
    'Καθαριότητα',
];

/* ============================ SEARCH ============================ */

/** Lower-case, accent-stripped form for diacritic-insensitive Greek matching. */
export function normalizeGreek(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** What a search query looks like — drives the hint and how results are matched. */
export type QueryKind = 'empty' | 'subject' | 'address';

/**
 * Decides whether a search query reads as a subject title or an address. It is
 * data-driven first — the query is matched against the loaded subjects' titles
 * vs. their location texts, and whichever corpus it hits (location wins ties)
 * decides the kind. With no data match at all it's treated as an address, so a bare
 * street name ("Πυθαγόρα") behaves the same as one with a number ("Πυθαγόρα 4").
 * Empty input → 'empty'.
 */
export function classifySearchQuery(query: string, subjects: LandingSubject[]): QueryKind {
    const q = normalizeGreek(query);
    if (!q) return 'empty';

    let titleHits = 0;
    let addressHits = 0;
    for (const s of subjects) {
        if (normalizeGreek(s.title).includes(q)) titleHits++;
        if (s.where && normalizeGreek(s.where).includes(q)) addressHits++;
    }
    if (addressHits > 0 && addressHits >= titleHits) return 'address';
    if (titleHits > 0) return 'subject';

    // No match in any subject title or address → treat it as a place to locate on the map.
    return 'address';
}

/**
 * True when a subject's address text already names its municipality — so a card
 * showing the address can drop the separate municipality label to avoid repetition
 * (e.g. address "Πλατεία Δημαρχείου, Χαλάνδρι" in the δήμος Χαλανδρίου).
 */
export function addressNamesCity(where: string, cityName: string): boolean {
    if (!where || !cityName) return false;
    return normalizeGreek(where).includes(normalizeGreek(cityName));
}

/**
 * The location line shown on a subject card / tooltip: the address with the municipality
 * appended ("…, Δήμος Ζωγράφου") — unless the address already names the city — or just the
 * municipality when the subject has no address. Shared so every card renders it the same way.
 */
export function subjectLocationLine(subject: LandingSubject): string {
    if (!subject.where) return subject.nameMunicipality;
    const hideCity = addressNamesCity(subject.where, subject.cityName);
    return [subject.where, hideCity ? null : subject.nameMunicipality].filter(Boolean).join(', ');
}

/** Narrows subjects to those whose title or location text contains the query. */
export function filterSubjectsByQuery(subjects: LandingSubject[], query: string): LandingSubject[] {
    const q = normalizeGreek(query);
    if (!q) return subjects;
    return subjects.filter(
        (s) => normalizeGreek(s.title).includes(q) || (s.where ? normalizeGreek(s.where).includes(q) : false),
    );
}

/* ============================ VIEWPORT ============================ */

/** Current map view: bounds (west/south/east/north) + centre, in lng/lat degrees. */
export type MapViewport = { w: number; s: number; e: number; n: number; clng: number; clat: number };

export function subjectInViewport(s: LandingSubject, v: MapViewport): boolean {
    return s.lng >= v.w && s.lng <= v.e && s.lat >= v.s && s.lat <= v.n;
}

/** The `n` subjects closest to a point (squared-degree distance — fine at city scale). */
export function nearestSubjects(subjects: LandingSubject[], clat: number, clng: number, n: number): LandingSubject[] {
    const d2 = (s: LandingSubject) => (s.lat - clat) ** 2 + (s.lng - clng) ** 2;
    return [...subjects].sort((a, b) => d2(a) - d2(b)).slice(0, n);
}

/** Subjects within `km` of a point (haversine), nearest first — for the address search. */
export function subjectsWithinKm(subjects: LandingSubject[], lat: number, lng: number, km: number): LandingSubject[] {
    const R = 6371; // earth radius, km
    const toRad = (d: number) => (d * Math.PI) / 180;
    const distKm = (s: LandingSubject) => {
        const dLat = toRad(s.lat - lat);
        const dLng = toRad(s.lng - lng);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat)) * Math.cos(toRad(s.lat)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    return subjects
        .map((s) => ({ s, d: distKm(s) }))
        .filter(({ d }) => d <= km)
        .sort((a, b) => a.d - b.d)
        .map(({ s }) => s);
}

/** Key identifying an exact location, so subjects at the same spot group together. */
export function locationKey(s: LandingSubject): string {
    return `${s.lng.toFixed(5)},${s.lat.toFixed(5)}`;
}

/* ============================ INTEREST ============================ */

/**
 * The municipality a visitor seems interested in — either one in our network
 * (a known city) or a name they searched for that we don't cover.
 */
export type MunicipalityInterest =
    | { kind: 'known'; cityId: string; name: string; nameMunicipality: string }
    | { kind: 'unknown'; name: string };

/**
 * Reads a "δήμος X" search (or a bare municipality name) and resolves it to a
 * known city or an out-of-network name. Returns null for non-municipality queries
 * (so a normal topic/address search doesn't set an interest).
 */
/** Drops a leading "δήμος/δήμου/δήμο" word from a normalized string ("δημος χανιων" → "χανιων"). */
function stripDimosPrefix(normalized: string): string {
    const parts = normalized.split(/\s+/);
    return parts.length > 1 && parts[0].startsWith('δημ') ? parts.slice(1).join(' ') : normalized;
}

/** Fuzzy name match: exact, or one contains the other (guarded by length to avoid noise). */
function nameMatches(q: string, target: string): boolean {
    if (!target) return false;
    if (q === target) return true;
    return q.length >= 4 && (target.includes(q) || q.includes(target));
}

export function detectMunicipalityQuery(
    query: string,
    cities: { id: string; name: string; name_municipality: string }[],
): MunicipalityInterest | null {
    const raw = query.trim();
    if (!raw) return null;
    const tokens = raw.split(/\s+/);
    // "δήμος <name>" → drop the leading δημ-word; otherwise match the whole query
    const hasDimos = tokens.length > 1 && normalizeGreek(tokens[0]).startsWith('δημ');
    const displayName = hasDimos ? tokens.slice(1).join(' ') : raw;
    const namePart = normalizeGreek(displayName);
    const fullQuery = normalizeGreek(raw);

    // Match against both the nominative `name` (e.g. "Χανιά") and the genitive
    // `name_municipality` (e.g. "Δήμος Χανίων") so the "δήμος X" search resolves for every
    // OC municipality, not just ones whose nominative is a substring of the genitive (Athens).
    const known = cities.find((c) => {
        const cn = normalizeGreek(c.name);
        const cmFull = normalizeGreek(c.name_municipality);
        const cmName = stripDimosPrefix(cmFull);
        return nameMatches(namePart, cn) || nameMatches(namePart, cmName) || fullQuery === cmFull;
    });
    if (known) return { kind: 'known', cityId: known.id, name: known.name, nameMunicipality: known.name_municipality };
    if (hasDimos && namePart.length >= 3) return { kind: 'unknown', name: displayName };
    return null;
}

/**
 * Resolves a search query to a matching category (topic) id, so a query "similar to" a
 * category name can apply that filter (like clicking the badge). Conservative: needs ≥4
 * chars and an exact / prefix match against a topic name. Returns null otherwise.
 */
export function detectCategoryQuery(query: string, topics: { id: string; name: string }[]): string | null {
    const q = normalizeGreek(query);
    if (q.length < 4) return null;
    for (const t of topics) {
        const tn = normalizeGreek(t.name);
        if (tn === q || tn.startsWith(q) || q.startsWith(tn)) return t.id;
        // word-level match, ignoring punctuation like "&" — so "αδεσποτα" hits "Ζώα & Αδέσποτα".
        const words = tn.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
        if (words.some((w) => w === q || w.startsWith(q) || q.startsWith(w))) return t.id;
    }
    return null;
}

/** Groups subjects sharing an exact location into one entry (order preserved). */
export function groupByLocation(subjects: LandingSubject[]): LandingSubject[][] {
    const groups = new Map<string, LandingSubject[]>();
    for (const s of subjects) {
        const key = locationKey(s);
        const g = groups.get(key);
        if (g) g.push(s);
        else groups.set(key, [s]);
    }
    return Array.from(groups.values());
}
