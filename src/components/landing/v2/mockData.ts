/**
 * Mock data for the landing-page redesign (iteration 1, issue #208).
 *
 * These shapes stand in for APIs that don't exist yet:
 *   - trendingSubjects  → a "what's hot across cities" ranking (recency × discussion volume)
 *   - upcomingMeetings  → next scheduled council meetings
 *   - platformStats     → precomputed platform-wide aggregates (cached, not live)
 *   - cityCards         → per-city summary (stats + recent hot subjects)
 *
 * When the real endpoints land, swap these for server queries with the same shapes.
 * Every `href` points at a real, existing route so the preview has no broken links.
 */

export type TopicChip = {
    name: string;
    /** hex color from the Topic model, used for the chip accent */
    colorHex: string;
    /** kebab-case lucide icon name from the Topic model (e.g. "leaf") */
    icon?: string;
};

export type TrendingSubject = {
    id: string;
    title: string;
    cityName: string;
    cityLogo?: string;
    topic: TopicChip;
    /** e.g. "πριν 2 ημέρες" */
    recencyLabel: string;
    /** a small, interesting stat e.g. "32′ συζήτηση" */
    statLabel: string;
    href: string;
};

export type UpcomingMeeting = {
    id: string;
    cityName: string;
    cityLogo?: string;
    adminBodyName: string;
    /** ISO date string */
    dateISO: string;
    href: string;
};

export type PlatformStats = {
    citiesCount: number;
    meetingsCount: number;
    /** total hours of deliberation made searchable (Σ speakingSeconds / 3600) */
    hoursSearchable: number;
    subjectsCount: number;
    /** topic mix, share is 0..1 */
    topicMix: Array<{ topic: TopicChip; share: number }>;
};

export type CityCard = {
    id: string;
    name: string;
    logo?: string;
    stats: {
        meetings: number;
        /** hours of deliberation for this city */
        hours: number;
        persons: number;
        parties: number;
    };
    topTopic: TopicChip;
    recentSubjects: Array<{ title: string; href: string; topic: TopicChip }>;
    href: string;
};

export type CoverageCity = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    href: string;
};

// --- Topic palette (mirrors a few real Topic colorHex values) ---
const T = {
    budget: { name: 'Προϋπολογισμός', colorHex: '#2563eb', icon: 'coins' },
    environment: { name: 'Περιβάλλον', colorHex: '#16a34a', icon: 'leaf' },
    transport: { name: 'Συγκοινωνίες', colorHex: '#ea580c', icon: 'bus' },
    urbanism: { name: 'Πολεοδομία', colorHex: '#9333ea', icon: 'building-2' },
    culture: { name: 'Πολιτισμός', colorHex: '#db2777', icon: 'palette' },
    health: { name: 'Υγεία & Πρόνοια', colorHex: '#0d9488', icon: 'heart-pulse' },
} satisfies Record<string, TopicChip>;

export const trendingSubjects: TrendingSubject[] = [
    {
        id: 's1',
        title: 'Αναπλάση της κεντρικής πλατείας και πεζοδρόμηση',
        cityName: 'Δήμος Χανίων',
        topic: T.urbanism,
        recencyLabel: 'πριν 2 ημέρες',
        statLabel: '41′ συζήτηση',
        href: '/chania',
    },
    {
        id: 's2',
        title: 'Προϋπολογισμός 2026 — αυξήσεις σε καθαριότητα & πράσινο',
        cityName: 'Δήμος Θεσσαλονίκης',
        topic: T.budget,
        recencyLabel: 'πριν 3 ημέρες',
        statLabel: '1ώ 12′ συζήτηση',
        href: '/thessaloniki',
    },
    {
        id: 's3',
        title: 'Νέες λωρίδες ποδηλάτου στον παραλιακό άξονα',
        cityName: 'Δήμος Καλαμαριάς',
        topic: T.transport,
        recencyLabel: 'πριν 4 ημέρες',
        statLabel: '28′ συζήτηση',
        href: '/kalamaria',
    },
    {
        id: 's4',
        title: 'Διαχείριση απορριμμάτων και κομποστοποίηση',
        cityName: 'Δήμος Βριλησσίων',
        topic: T.environment,
        recencyLabel: 'πριν 5 ημέρες',
        statLabel: '34′ συζήτηση',
        href: '/vrilissia',
    },
    {
        id: 's5',
        title: 'Πρόγραμμα πολιτιστικού καλοκαιριού 2026',
        cityName: 'Δήμος Χανίων',
        topic: T.culture,
        recencyLabel: 'πριν 1 εβδομάδα',
        statLabel: '19′ συζήτηση',
        href: '/chania',
    },
];

export const upcomingMeetings: UpcomingMeeting[] = [
    {
        id: 'm1',
        cityName: 'Δήμος Θεσσαλονίκης',
        adminBodyName: 'Δημοτικό Συμβούλιο',
        dateISO: '2026-06-09T18:00:00+03:00',
        href: '/thessaloniki',
    },
    {
        id: 'm2',
        cityName: 'Δήμος Καλαμαριάς',
        adminBodyName: 'Οικονομική Επιτροπή',
        dateISO: '2026-06-11T17:30:00+03:00',
        href: '/kalamaria',
    },
    {
        id: 'm3',
        cityName: 'Δήμος Χανίων',
        adminBodyName: 'Δημοτικό Συμβούλιο',
        dateISO: '2026-06-12T19:00:00+03:00',
        href: '/chania',
    },
];

export const platformStats: PlatformStats = {
    citiesCount: 24,
    meetingsCount: 612,
    hoursSearchable: 1840,
    subjectsCount: 7300,
    topicMix: [
        { topic: T.budget, share: 0.22 },
        { topic: T.urbanism, share: 0.19 },
        { topic: T.environment, share: 0.16 },
        { topic: T.transport, share: 0.14 },
        { topic: T.culture, share: 0.11 },
        { topic: T.health, share: 0.09 },
    ],
};

export const cityCards: CityCard[] = [
    {
        id: 'thessaloniki',
        name: 'Δήμος Θεσσαλονίκης',
        stats: { meetings: 84, hours: 240, persons: 49, parties: 8 },
        topTopic: T.budget,
        recentSubjects: [
            { title: 'Προϋπολογισμός 2026', href: '/thessaloniki', topic: T.budget },
            { title: 'Ανάπλαση ΔΕΘ', href: '/thessaloniki', topic: T.urbanism },
        ],
        href: '/thessaloniki',
    },
    {
        id: 'chania',
        name: 'Δήμος Χανίων',
        stats: { meetings: 61, hours: 173, persons: 33, parties: 6 },
        topTopic: T.urbanism,
        recentSubjects: [
            { title: 'Πεζοδρόμηση κέντρου', href: '/chania', topic: T.urbanism },
            { title: 'Πολιτιστικό καλοκαίρι', href: '/chania', topic: T.culture },
        ],
        href: '/chania',
    },
    {
        id: 'kalamaria',
        name: 'Δήμος Καλαμαριάς',
        stats: { meetings: 47, hours: 138, persons: 27, parties: 5 },
        topTopic: T.transport,
        recentSubjects: [
            { title: 'Λωρίδες ποδηλάτου', href: '/kalamaria', topic: T.transport },
            { title: 'Στάθμευση παραλιακής', href: '/kalamaria', topic: T.transport },
        ],
        href: '/kalamaria',
    },
    {
        id: 'athens',
        name: 'Δήμος Αθηναίων',
        stats: { meetings: 92, hours: 268, persons: 49, parties: 9 },
        topTopic: T.urbanism,
        recentSubjects: [
            { title: 'Ανάπλαση πλατείας Ομονοίας', href: '/athens', topic: T.urbanism },
            { title: 'Πεζοδρομήσεις στο κέντρο', href: '/athens', topic: T.transport },
        ],
        href: '/athens',
    },
    {
        id: 'patras',
        name: 'Δήμος Πατρέων',
        stats: { meetings: 54, hours: 151, persons: 31, parties: 6 },
        topTopic: T.environment,
        recentSubjects: [
            { title: 'Διαχείριση απορριμμάτων', href: '/patras', topic: T.environment },
            { title: 'Αντιπλημμυρικά έργα', href: '/patras', topic: T.environment },
        ],
        href: '/patras',
    },
    {
        id: 'heraklion',
        name: 'Δήμος Ηρακλείου',
        stats: { meetings: 49, hours: 142, persons: 29, parties: 6 },
        topTopic: T.culture,
        recentSubjects: [
            { title: 'Πολιτιστικές εκδηλώσεις', href: '/heraklion', topic: T.culture },
            { title: 'Αναβάθμιση Ενετικών τειχών', href: '/heraklion', topic: T.urbanism },
        ],
        href: '/heraklion',
    },
    {
        id: 'larissa',
        name: 'Δήμος Λαρισαίων',
        stats: { meetings: 43, hours: 124, persons: 28, parties: 5 },
        topTopic: T.budget,
        recentSubjects: [
            { title: 'Προϋπολογισμός 2026', href: '/larissa', topic: T.budget },
            { title: 'Δημοτικά τέλη', href: '/larissa', topic: T.budget },
        ],
        href: '/larissa',
    },
    {
        id: 'volos',
        name: 'Δήμος Βόλου',
        stats: { meetings: 41, hours: 119, persons: 26, parties: 5 },
        topTopic: T.transport,
        recentSubjects: [
            { title: 'Αστική κινητικότητα', href: '/volos', topic: T.transport },
            { title: 'Λιμάνι & παραλία', href: '/volos', topic: T.urbanism },
        ],
        href: '/volos',
    },
    {
        id: 'ioannina',
        name: 'Δήμος Ιωαννιτών',
        stats: { meetings: 38, hours: 108, persons: 25, parties: 5 },
        topTopic: T.health,
        recentSubjects: [
            { title: 'Κοινωνικές δομές', href: '/ioannina', topic: T.health },
            { title: 'Δημοτικά ιατρεία', href: '/ioannina', topic: T.health },
        ],
        href: '/ioannina',
    },
];

// --- Hero carousel: slide 2 (municipality logos) ---
// Real logos come from getSupportedCitiesWithLogos(); here we mock short names and
// leave logoImage undefined so the slide falls back to initials in the preview.
export type MunicipalityLogo = { id: string; shortName: string; logoImage?: string };

export const municipalityLogos: MunicipalityLogo[] = [
    { id: 'thessaloniki', shortName: 'Θεσσαλονίκης' },
    { id: 'chania', shortName: 'Χανίων' },
    { id: 'kalamaria', shortName: 'Καλαμαριάς' },
    { id: 'vrilissia', shortName: 'Βριλησσίων' },
    { id: 'athens', shortName: 'Αθηναίων' },
    { id: 'patras', shortName: 'Πατρέων' },
    { id: 'heraklion', shortName: 'Ηρακλείου' },
    { id: 'larissa', shortName: 'Λαρισαίων' },
    { id: 'volos', shortName: 'Βόλου' },
    { id: 'ioannina', shortName: 'Ιωαννιτών' },
    { id: 'rhodes', shortName: 'Ρόδου' },
    { id: 'kavala', shortName: 'Καβάλας' },
];

// --- Hero carousel: slide 1 (colorful timeline illustration) ---
// Intentionally uses vivid colors beyond the app palette (per the "more colors"
// instruction). The wide orange segment is the one the loose arrow points at.
export type TimelineSegment = { color: string; width: number; isTarget?: boolean };

export const timelineSegments: TimelineSegment[] = [
    { color: '#fc550a', width: 13 },
    { color: '#2563eb', width: 9 },
    { color: '#fc550a', width: 24, isTarget: true },
    { color: '#16a34a', width: 11 },
    { color: '#7c3aed', width: 10 },
    { color: '#db2777', width: 8 },
    { color: '#0d9488', width: 9 },
    { color: '#f59e0b', width: 16 },
];

// --- Hero carousel: slide 3 (explain Q&A CTA) ---
export type ExplainQA = { q: string; a: string };

export const explainQA: ExplainQA[] = [
    { q: 'Τι ακριβώς κάνει ένας δήμος;', a: 'Από τα σκουπίδια ως τα σχολεία — τα καθημερινά της πόλης σου.' },
    { q: 'Πού πάνε τα χρήματα του προϋπολογισμού;', a: 'Ποιος αποφασίζει, σε τι ξοδεύονται και πώς το ελέγχεις.' },
    { q: 'Πώς εκλέγεται το δημοτικό συμβούλιο;', a: 'Παρατάξεις, έδρες και τι σημαίνει η ψήφος σου τοπικά.' },
];

export const coverageCities: CoverageCity[] = [
    { id: 'thessaloniki', name: 'Θεσσαλονίκη', lat: 40.6403, lng: 22.9444, href: '/thessaloniki' },
    { id: 'chania', name: 'Χανιά', lat: 35.5138, lng: 24.018, href: '/chania' },
    { id: 'kalamaria', name: 'Καλαμαριά', lat: 40.5836, lng: 22.9508, href: '/kalamaria' },
    { id: 'vrilissia', name: 'Βριλήσσια', lat: 38.0353, lng: 23.8316, href: '/vrilissia' },
    { id: 'athens', name: 'Αθήνα', lat: 37.9838, lng: 23.7275, href: '/athens' },
    { id: 'patras', name: 'Πάτρα', lat: 38.2466, lng: 21.7346, href: '/patras' },
];
