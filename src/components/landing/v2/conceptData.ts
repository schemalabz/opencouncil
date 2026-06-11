/**
 * Mock data for the map-first landing redesign.
 *
 * Ported from the design handoff's `data.js`. These shapes stand in for APIs that
 * don't exist yet — geo-located "hot subjects", municipalities, and meetings across
 * the Attica cluster, so one map view holds them all. Swap for server queries when
 * the real endpoints land.
 *
 * NOTE: coordinates are stored as { lat, lng }. Mapbox expects [lng, lat] tuples,
 * so use `lngLat()` when building GeoJSON.
 */

import { Building2, CarFront, Euro, HeartHandshake, Leaf, Store, type LucideIcon } from 'lucide-react';

export type CategoryKey =
    | 'transport'
    | 'budget'
    | 'env'
    | 'works'
    | 'social'
    | 'daily';

export type Category = {
    key: CategoryKey;
    /** full label, e.g. "Κυκλοφορία & Στάθμευση" */
    label: string;
    /** short label for chips/legend, e.g. "Κυκλοφορία" */
    short: string;
    /** hex accent used for pins, chips and the left rail */
    color: string;
    /** lucide icon shown in category badges and map pins */
    icon: LucideIcon;
};

// Icons follow the real topic taxonomy: transport → Συγκοινωνίες, budget →
// Προϋπολογισμός & Οικονομία, env → Περιβάλλον, works → Πολεοδομία, social →
// Πρόνοια, daily → Εμπόριο & Καταστήματα (λαϊκές, τραπεζοκαθίσματα κ.λπ.).
export const CATEGORIES: Record<CategoryKey, Category> = {
    transport: { key: 'transport', label: 'Κυκλοφορία & Στάθμευση', short: 'Κυκλοφορία', color: '#2E7D8C', icon: CarFront },
    budget: { key: 'budget', label: 'Προϋπολογισμός & Οικονομικά', short: 'Οικονομικά', color: '#3C5A99', icon: Euro },
    env: { key: 'env', label: 'Περιβάλλον & Πράσινο', short: 'Περιβάλλον', color: '#3E8E5A', icon: Leaf },
    works: { key: 'works', label: 'Πολεοδομία & Έργα', short: 'Έργα', color: '#B07A2E', icon: Building2 },
    social: { key: 'social', label: 'Κοινωνικά & Πρόνοια', short: 'Κοινωνικά', color: '#7A5298', icon: HeartHandshake },
    daily: { key: 'daily', label: 'Καθημερινότητα', short: 'Καθημερινότητα', color: '#B05468', icon: Store },
};

export const categoryList: Category[] = Object.values(CATEGORIES);

export type Municipality = {
    slug: string;
    name: string;
    lat: number;
    lng: number;
    sessions: number;
    parties: number;
    people: number;
    /** real route on the site, so the preview has no broken links */
    href: string;
};

// Attica cluster — municipalities OpenCouncil covers in the metro area.
export const MUNICIPALITIES: Municipality[] = [
    { slug: 'athens', name: 'Αθήνα', lat: 37.9809, lng: 23.7294, sessions: 54, parties: 7, people: 154, href: '/athens' },
    { slug: 'zografou', name: 'Ζωγράφου', lat: 37.9756, lng: 23.77, sessions: 20, parties: 4, people: 37, href: '/zografou' },
    { slug: 'chalandri', name: 'Χαλάνδρι', lat: 38.0214, lng: 23.7997, sessions: 23, parties: 5, people: 37, href: '/chalandri' },
    { slug: 'vrilissia', name: 'Βριλήσσια', lat: 38.033, lng: 23.833, sessions: 13, parties: 5, people: 31, href: '/vrilissia' },
];

export function municipalityOf(slug: string): Municipality {
    return MUNICIPALITIES.find((m) => m.slug === slug) ?? MUNICIPALITIES[0];
}

export type Topic = {
    id: string;
    title: string;
    cat: CategoryKey;
    /** municipality slug */
    muni: string;
    lat: number;
    lng: number;
    date: string;
    /** "πολυσυζητημένο" — gets a bigger pin, hot tag and a photo placeholder */
    hot: boolean;
    /** number of σχετικές τοποθετήσεις (discussion volume) */
    count: number;
    /** minutes of council discussion spent on the subject (speaking time) */
    durationMin: number;
    /** the street / area it refers to */
    where: string;
    /** short AI summary line */
    summary: string;
    /** link to the subject's page */
    href: string;

    // --- richer subject metadata (maps to the Subject schema) ---
    /** went to a vote / has a Decision → "Με ψηφοφορία" badge (Subject.decision / votes) */
    hasVote?: boolean;
    /** a related subject/theme → "Σχετίζεται με …" */
    relatedTo?: string;
    /** name of the primary subject it was grouped under (Subject.discussedIn) */
    discussedIn?: string;
    /** external context blurb (Subject.context) */
    context?: string;
};

// Topics — geo-located, June 2026.
export const TOPICS: Topic[] = [
    { id: 't1', title: 'Δάνειο 75 εκατ. € από την ΕΤΕπ για αντιπλημμυρικά', cat: 'budget', muni: 'athens', lat: 37.9836, lng: 23.727, date: '10 Ιουν 2026', hot: true, count: 48, durationMin: 38, where: 'Δήμος Αθηναίων', summary: 'Έγκριση δανείου για έργα διαχείρισης ομβρίων σε Κυψέλη και Πατήσια.', href: '/athens', hasVote: true, relatedTo: 'Αντιπλημμυρική θωράκιση Αττικής', context: 'Η ΕΤΕπ ενέκρινε δανειοδότηση 75 εκατ. € για αντιπλημμυρικά έργα στην Αθήνα, μετά τις πλημμύρες του 2024.' },
    { id: 't2', title: 'Κατάργηση στάθμευσης στην οδό Γυθείου', cat: 'transport', muni: 'athens', lat: 37.9748, lng: 23.7402, date: '10 Ιουν 2026', hot: false, count: 12, durationMin: 9, where: 'Γυθείου, Αμπελόκηποι', summary: 'Νέα διπλή κίτρινη γραμμή για να περνούν τα απορριμματοφόρα.', href: '/athens', hasVote: true },
    { id: 't3', title: 'Διακοπή κυκλοφορίας στην οδό Καλαίσχρου', cat: 'transport', muni: 'athens', lat: 37.9881, lng: 23.7361, date: '10 Ιουν 2026', hot: false, count: 7, durationMin: 6, where: 'Καλαίσχρου, Κυψέλη', summary: 'Προσωρινή διακοπή λόγω αποκατάστασης δικτύου ύδρευσης.', href: '/athens', discussedIn: 'Έργα ύδρευσης Κυψέλης' },
    { id: 't4', title: 'Οριοθέτηση Λαϊκής Αγοράς Αγίας Λαύρας', cat: 'daily', muni: 'zografou', lat: 37.9792, lng: 23.7651, date: '04 Ιουν 2026', hot: false, count: 19, durationMin: 14, where: 'Αγ. Λαύρας, Ζωγράφου', summary: 'Επαναχωροθέτηση πάγκων μετά από παράπονα κατοίκων για πρόσβαση.', href: '/zografou', hasVote: true },
    { id: 't5', title: '3η Αναμόρφωση Προϋπολογισμού Δήμου', cat: 'budget', muni: 'zografou', lat: 37.9748, lng: 23.7726, date: '04 Ιουν 2026', hot: false, count: 9, durationMin: 11, where: 'Δήμος Ζωγράφου', summary: 'Ενίσχυση κονδυλίων για σχολικές επισκευές και πράσινο.', href: '/zografou', hasVote: true },
    { id: 't6', title: 'Κυκλοφοριακές ρυθμίσεις σε τέσσερις οδούς', cat: 'transport', muni: 'zografou', lat: 37.9719, lng: 23.7689, date: '04 Ιουν 2026', hot: true, count: 33, durationMin: 27, where: 'Γουδή / Ζωγράφου', summary: 'Μονοδρομήσεις & νέοι ποδηλατόδρομοι κοντά στην Πανεπιστημιούπολη.', href: '/zografou', hasVote: true, relatedTo: 'Ποδηλατικό δίκτυο Ζωγράφου' },
    { id: 't7', title: 'Κοπή πεύκων στην οδό Ανδρούτσου', cat: 'env', muni: 'chalandri', lat: 38.0227, lng: 23.7984, date: '25 Μαΐ 2026', hot: true, count: 41, durationMin: 44, where: 'Ανδρούτσου, Χαλάνδρι', summary: 'Έντονη αντιπαράθεση για την υλοτόμηση 6 πεύκων λόγω ασφάλειας.', href: '/chalandri', hasVote: true, relatedTo: 'Διαχείριση πρασίνου Χαλανδρίου', context: 'Η κοπή των έξι πεύκων στην οδό Ανδρούτσου προκάλεσε αντιδράσεις κατοίκων και περιβαλλοντικών οργανώσεων.' },
    { id: 't8', title: 'Τραπεζοκαθίσματα καταστήματος υγ. ενδιαφέροντος', cat: 'daily', muni: 'chalandri', lat: 38.0201, lng: 23.8016, date: '25 Μαΐ 2026', hot: false, count: 6, durationMin: 7, where: 'Πλ. Δούρου, Χαλάνδρι', summary: 'Άδεια ανάπτυξης τραπεζοκαθισμάτων σε πεζόδρομο.', href: '/chalandri', discussedIn: 'Καταστήματα υγειονομικού ενδιαφέροντος' },
    { id: 't9', title: 'Αναβάθμιση οδοφωτισμού σε LED', cat: 'works', muni: 'vrilissia', lat: 38.0341, lng: 23.8312, date: '03 Ιουν 2026', hot: false, count: 14, durationMin: 12, where: 'Δήμος Βριλησσίων', summary: 'Αντικατάσταση 2.400 λαμπτήρων — εξοικονόμηση 38% ενέργειας.', href: '/vrilissia', hasVote: true },
    { id: 't10', title: 'Ανάπλαση πλατείας Αναλήψεως & νέο πράσινο', cat: 'env', muni: 'chalandri', lat: 38.0186, lng: 23.7949, date: '25 Μαΐ 2026', hot: false, count: 22, durationMin: 18, where: 'Πλ. Αναλήψεως, Χαλάνδρι', summary: 'Νέες δενδροφυτεύσεις και αστικός εξοπλισμός με σκίαστρα.', href: '/chalandri', relatedTo: 'Πράσινο & κοινόχρηστοι χώροι' },
    { id: 't11', title: 'Νέος βρεφονηπιακός σταθμός — προγραμματισμός 2026', cat: 'social', muni: 'zografou', lat: 37.9779, lng: 23.7771, date: '04 Ιουν 2026', hot: false, count: 17, durationMin: 21, where: 'Άνω Ιλίσια, Ζωγράφου', summary: 'Χωροθέτηση και χρηματοδότηση 80 νέων θέσεων φιλοξενίας.', href: '/zografou', hasVote: true },
    { id: 't12', title: 'Πεζοδρόμηση τμήματος εμπορικού κέντρου', cat: 'works', muni: 'vrilissia', lat: 38.0312, lng: 23.8358, date: '03 Ιουν 2026', hot: true, count: 36, durationMin: 31, where: 'Λ. Πεντέλης, Βριλήσσια', summary: 'Πιλοτική πεζοδρόμηση Σαββατοκύριακα — δοκιμή τριών μηνών.', href: '/vrilissia', hasVote: true, context: 'Πιλοτική πεζοδρόμηση τα Σαββατοκύριακα στο εμπορικό κέντρο Βριλησσίων, κατά το πρότυπο άλλων δήμων της Αττικής.' },
];

export type Meeting = {
    muni: string;
    title: string;
    date: string;
    time: string;
    inDays: number;
    topics: number;
    status: 'upcoming' | 'recent';
};

export const MEETINGS: Meeting[] = [
    { muni: 'athens', title: 'Δημοτικό Συμβούλιο', date: '10 Ιουν 2026', time: '12:00', inDays: 2, topics: 27, status: 'upcoming' },
    { muni: 'vrilissia', title: 'Δημοτικό Συμβούλιο', date: '11 Ιουν 2026', time: '18:30', inDays: 3, topics: 9, status: 'upcoming' },
    { muni: 'zografou', title: 'Δημοτική Επιτροπή', date: '12 Ιουν 2026', time: '10:00', inDays: 4, topics: 14, status: 'upcoming' },
    { muni: 'chalandri', title: 'Δημοτικό Συμβούλιο', date: '25 Μαΐ 2026', time: '19:00', inDays: -14, topics: 6, status: 'recent' },
];

/** Faked "near me" location (Ζωγράφου) — used when geolocation is denied/unavailable. */
export const FAKE_GEO = { lat: 37.9756, lng: 23.77 };

/** Accent color for "πολυσυζητημένα / hot" topics — the app's brand orange. */
export const HOT_COLOR = '#fc550a';

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
