/**
 * Data types and view-model helpers for the landing redesign. Wire shapes are the
 * Prisma-derived db-layer types, imported (not re-declared) so server/routes/client can't drift.
 */

import type { AdministrativeBodyType } from '@prisma/client';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { normalizeText } from '@/lib/utils';
import { haversineDistance } from '@/lib/geo';
import type { RankingComponent } from '@/lib/ranking/subjects';
import type { MapSubjectRow, GeneralSubjectRow as DbGeneralSubjectRow, GeneralCityRow as DbGeneralCityRow } from '@/lib/db/subject';
import type { MapCityRow, CityMinimalWithCounts } from '@/lib/db/cities';
import type { UpcomingMeetingWithCity } from '@/lib/db/meetings';
import type { LatLng } from '@/lib/google-maps';

export type MapSubject = MapSubjectRow;
export type GeneralSubjectRow = DbGeneralSubjectRow;
export type GeneralCityRow = DbGeneralCityRow;

/** A cooperating municipality with its centroid + logo, for the "Municipalities map" mode. */
export type LandingMapCity = MapCityRow;

/** Cities the landing lists — a subset of CityMinimalWithCounts. Named to avoid colliding with
 *  src/lib/db/landing.ts's LandingCity. */
export type LandingListCity = Pick<
    CityMinimalWithCounts,
    'id' | 'name' | 'name_en' | 'name_municipality' | 'logoImage' | '_count'
>;

/** A serialized (Date → string) view of UpcomingMeetingWithCity, derived so it tracks the schema. */
export type UpcomingMeeting = Pick<UpcomingMeetingWithCity, 'id' | 'cityId' | 'name'> & {
    dateTime: string;
    city: Pick<UpcomingMeetingWithCity['city'], 'id' | 'name' | 'name_municipality' | 'logoImage'>;
    administrativeBody: { name: string } | null;
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
    /** dev-only: ranking score + breakdown for the on-card debug overlay. Unset in production. */
    _debugRanking?: { score: number; components: RankingComponent[] };
};

/** A municipality's non-located subjects (LandingSubjects anchored at the city centroid, empty
 *  `where`). `nameMunicipality` is the genitive form (e.g. "Δήμος Χαλανδρίου"). */
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
export type ClickedMunicipality = { id: string; name: string; geometry: GeoJSON.Geometry } & LatLng;
/** Open "co-located subjects" box — the subjects at one map point + its screen position. */
export type CoLocatedBox = { subjects: LandingSubject[]; x: number; y: number };
/** Open "general subjects" box — a municipality's non-located subjects + screen position. */
export type GeneralBox = { city: LandingGeneralCity; x: number; y: number };

export function toGeneralCities(
    rows: GeneralCityRow[],
    /** localized fallback topic name for subjects with no topic */
    generalLabel = 'Γενικά',
): LandingGeneralCity[] {
    // The row carries the city's name/genitive/logo (see getGeneralSubjectsCached), so there's no
    // per-city reconciliation against the loaded city list — the marker + cards render from it.
    return rows
        .filter((row) => isValidLngLat(row.lng, row.lat))
        .map((row) => ({
        cityId: row.cityId,
        cityName: row.cityName,
        nameMunicipality: row.nameMunicipality,
        lng: row.lng,
        lat: row.lat,
        subjects: row.subjects.map((s) => ({
            id: s.id,
            title: s.name,
            // descriptions are markdown with [text](REF:UTTERANCE:id) links — flatten to plain text
            summary: stripMarkdown(s.description),
            cityId: s.cityId,
            cityName: row.cityName,
            nameMunicipality: row.nameMunicipality,
            cityLogo: row.logoImage,
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
                // descriptions are markdown with [text](REF:UTTERANCE:id) links — flatten to plain text
                summary: stripMarkdown(s.description),
                cityId: s.cityId,
                cityName: s.cityName,
                nameMunicipality: s.nameMunicipality,
                cityLogo: s.logoImage,
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

/** What a search query looks like — drives the hint and how results are matched. */
export type QueryKind = 'empty' | 'subject' | 'address';

/**
 * Whether a query reads as a subject title or an address, by matching it against loaded subjects'
 * titles vs. location texts (location wins ties). No match → 'address'; empty → 'empty'.
 */
export function classifySearchQuery(query: string, subjects: LandingSubject[]): QueryKind {
    const q = normalizeText(query).trim();
    if (!q) return 'empty';

    let titleHits = 0;
    let addressHits = 0;
    for (const s of subjects) {
        if (normalizeText(s.title).trim().includes(q)) titleHits++;
        if (s.where && normalizeText(s.where).trim().includes(q)) addressHits++;
    }
    if (addressHits > 0 && addressHits >= titleHits) return 'address';
    if (titleHits > 0) return 'subject';

    // No match → treat as a place to locate on the map.
    return 'address';
}

/** True when the address text already names its municipality, so a card can drop the extra label. */
export function addressNamesCity(where: string, cityName: string): boolean {
    if (!where || !cityName) return false;
    return normalizeText(where).trim().includes(normalizeText(cityName).trim());
}

/**
 * The location line on a card/tooltip: address + municipality ("…, Δήμος Ζωγράφου"), or just the
 * municipality when there's no address (and no municipality when the address already names it).
 */
export function subjectLocationLine(subject: LandingSubject): string {
    if (!subject.where) return subject.nameMunicipality;
    const hideCity = addressNamesCity(subject.where, subject.cityName);
    return [subject.where, hideCity ? null : subject.nameMunicipality].filter(Boolean).join(', ');
}

/** Narrows subjects to those whose title or location text contains the query. */
export function filterSubjectsByQuery(subjects: LandingSubject[], query: string): LandingSubject[] {
    const q = normalizeText(query).trim();
    if (!q) return subjects;
    return subjects.filter(
        (s) => normalizeText(s.title).trim().includes(q) || (s.where ? normalizeText(s.where).trim().includes(q) : false),
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
    // haversineDistance takes [lng, lat] points and returns metres → convert the radius to metres.
    const maxMeters = km * 1000;
    return subjects
        .map((s) => ({ s, d: haversineDistance([lng, lat], [s.lng, s.lat]) }))
        .filter(({ d }) => d <= maxMeters)
        .sort((a, b) => a.d - b.d)
        .map(({ s }) => s);
}

/** Key identifying an exact location, so subjects at the same spot group together. */
export function locationKey(s: LandingSubject): string {
    return `${s.lng.toFixed(5)},${s.lat.toFixed(5)}`;
}

/* ============================ INTEREST ============================ */

/** The municipality a visitor seems interested in — a known city or an out-of-network name. */
export type MunicipalityInterest =
    | { kind: 'known'; cityId: string; name: string; nameMunicipality: string }
    | { kind: 'unknown'; name: string };

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
    const hasDimos = tokens.length > 1 && normalizeText(tokens[0]).trim().startsWith('δημ');
    const displayName = hasDimos ? tokens.slice(1).join(' ') : raw;
    const namePart = normalizeText(displayName).trim();
    const fullQuery = normalizeText(raw).trim();
    const known = cities.find((c) => {
        const cn = normalizeText(c.name).trim();
        const cmFull = normalizeText(c.name_municipality).trim();
        const cmName = stripDimosPrefix(cmFull);
        return nameMatches(namePart, cn) || nameMatches(namePart, cmName) || fullQuery === cmFull;
    });
    if (known) return { kind: 'known', cityId: known.id, name: known.name, nameMunicipality: known.name_municipality };
    if (hasDimos && namePart.length >= 3) return { kind: 'unknown', name: displayName };
    return null;
}

/**
 * Resolves a query to a matching topic id (so it applies that filter like clicking the badge).
 * Conservative: needs ≥4 chars and an exact/prefix match against a topic name. Null otherwise.
 */
export function detectCategoryQuery(query: string, topics: { id: string; name: string }[]): string | null {
    const q = normalizeText(query).trim();
    if (q.length < 4) return null;
    for (const t of topics) {
        const tn = normalizeText(t.name).trim();
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
