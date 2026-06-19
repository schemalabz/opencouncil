/**
 * Content model for the /explain knowledge hub ("Λεξικό της αυτοδιοίκησης").
 *
 * The hub and article pages are SEO landing pages targeting common Greek
 * searches around local government (δημοτικά συμβούλια, αρμοδιότητες, δια
 * περιφοράς, δημοτικές εκλογές, προϋπολογισμός δήμων). Topics are defined here
 * once and consumed by the hub cards/clusters and the article routes.
 *
 * Only topics with `published: true` have a real article at /explain/<slug>;
 * the rest render as placeholder cards until their article is written.
 */

export type ExplainCategory = "institutions" | "procedures" | "elections" | "finance";

export const CATEGORY_LABELS: Record<ExplainCategory, string> = {
    institutions: "Θεσμοί",
    procedures: "Διαδικασίες",
    elections: "Εκλογές",
    finance: "Οικονομικά",
};

export interface ExplainTopic {
    slug: string;
    /** Card / link title. */
    title: string;
    /** Short answer snippet shown on cards and in previews. */
    snippet: string;
    /** Optional secondary line used in the compact "most-searched" list. */
    subtitle?: string;
    category: ExplainCategory;
    /** Whether a full article exists at /explain/<slug>. */
    published?: boolean;
    /** Optional image URL; when absent a styled placeholder is shown. */
    image?: string;
    /** Render the category tag with the accent (orange) style. */
    accentTag?: boolean;
}

const RAW_TOPICS: Record<string, ExplainTopic> = {
    "dimotika-symvoulia": {
        slug: "dimotika-symvoulia",
        title: "Τι είναι τα δημοτικά συμβούλια;",
        snippet:
            "Το κύριο αποφασιστικό όργανο του δήμου, με αιρετά μέλη που εκλέγονται κάθε πέντε χρόνια στις δημοτικές εκλογές.",
        subtitle: "Το ανώτατο όργανο του δήμου",
        category: "institutions",
        published: true,
    },
    "dimotikos-symvoulos": {
        slug: "dimotikos-symvoulos",
        title: "Τι κάνει ο δημοτικός σύμβουλος;",
        snippet:
            "Ψηφίζει στις συνεδριάσεις, ελέγχει τη δημοτική αρχή και εκπροσωπεί τους δημότες. Δεν είναι υπάλληλος του δήμου.",
        subtitle: "Ο ρόλος του αιρετού",
        category: "institutions",
    },
    "proedros-dimotikou-symvouliou": {
        slug: "proedros-dimotikou-symvouliou",
        title: "Πρόεδρος δημοτικού συμβουλίου: ο ρόλος",
        snippet:
            "Συγκαλεί και διευθύνει τις συνεδριάσεις, καταρτίζει την ημερήσια διάταξη και υπογράφει τις αποφάσεις.",
        category: "institutions",
    },
    "dimotiko-diamerisma": {
        slug: "dimotiko-diamerisma",
        title: "Δημοτικό διαμέρισμα & κοινότητα",
        snippet:
            "Η υποδιαίρεση του δήμου σε μικρότερες γεωγραφικές ενότητες, καθεμιά με δικό της συμβούλιο κοινότητας.",
        category: "institutions",
    },
    "armodiotites-dimotikou-symvouliou": {
        slug: "armodiotites-dimotikou-symvouliou",
        title: "Αρμοδιότητες δημοτικού συμβουλίου",
        snippet:
            "Προϋπολογισμός, τέλη, κανονισμοί, ονομασίες οδών, τοπικά έργα — οι αποφάσεις που μπορεί να λάβει το σώμα.",
        subtitle: "Τι αποφασίζει — και τι όχι",
        category: "procedures",
    },
    "dia-periforas": {
        slug: "dia-periforas",
        title: "Τι σημαίνει «δια περιφοράς»;",
        snippet:
            "Συνεδρίαση όπου τα μέλη ψηφίζουν χωρίς φυσική παρουσία — τηλεφωνικά ή ηλεκτρονικά. Χρησιμοποιείται για επείγοντα θέματα.",
        subtitle: "Συνεδρίαση χωρίς φυσική παρουσία",
        category: "procedures",
    },
    "apofaseis-dimotikou-symvouliou": {
        slug: "apofaseis-dimotikou-symvouliou",
        title: "Αποφάσεις δημοτικού συμβουλίου: πού τις βρίσκω",
        snippet:
            "Αναρτώνται υποχρεωτικά στη Διαύγεια και στην ιστοσελίδα του δήμου. Δες πώς τις εντοπίζεις και τι περιέχουν.",
        category: "procedures",
    },
    "dimotikes-ekloges-2028": {
        slug: "dimotikes-ekloges-2028",
        title: "Δημοτικές εκλογές 2028",
        snippet:
            "Πότε διεξάγονται, ποιοι ψηφίζουν και τι εκλέγουμε — δήμαρχο, δημοτικό συμβούλιο και συμβούλια κοινοτήτων.",
        subtitle: "Πότε ψηφίζουμε & τι αλλάζει",
        category: "elections",
        accentTag: true,
    },
    "dimotikes-ekloges": {
        slug: "dimotikes-ekloges",
        title: "Πώς λειτουργούν οι δημοτικές εκλογές",
        snippet:
            "Το εκλογικό σύστημα της αυτοδιοίκησης: σταυροί, δεύτερος γύρος, κατανομή εδρών και ο ρόλος της απλής αναλογικής.",
        category: "elections",
        accentTag: true,
    },
    "proypologismos-dimon": {
        slug: "proypologismos-dimon",
        title: "Προϋπολογισμός δήμων: πώς διαβάζεται",
        snippet:
            "Έσοδα, έξοδα, ανταποδοτικά τέλη και επενδύσεις — πώς να καταλάβεις πού πάνε τα χρήματα του δήμου σου.",
        category: "finance",
    },
};

/**
 * Each topic defaults to its matching minimal illustration in /public/explain
 * (keyed by slug). Set `image` explicitly on a topic to override.
 */
export const TOPICS: Record<string, ExplainTopic> = Object.fromEntries(
    Object.entries(RAW_TOPICS).map(([slug, topic]) => [
        slug,
        { ...topic, image: topic.image ?? `/explain/${slug}.svg` },
    ]),
);

/** Resolve the link target for a topic: real route if published, else placeholder. */
export function topicHref(topic: ExplainTopic): string {
    return topic.published ? `/explain/${topic.slug}` : "#";
}

/** The "Ξεκίνα από εδώ" featured topic and its companion most-searched list. */
export const FEATURED_SLUG = "dimotika-symvoulia";
export const FEATURED_SIDE_SLUGS = [
    "armodiotites-dimotikou-symvouliou",
    "dia-periforas",
    "dimotikes-ekloges-2028",
];

export interface ExplainCluster {
    title: string;
    slugs: string[];
}

export const CLUSTERS: ExplainCluster[] = [
    {
        title: "Θεσμοί & όργανα",
        slugs: [
            "dimotika-symvoulia",
            "dimotikos-symvoulos",
            "proedros-dimotikou-symvouliou",
            "dimotiko-diamerisma",
        ],
    },
    {
        title: "Διαδικασίες & αποφάσεις",
        slugs: [
            "armodiotites-dimotikou-symvouliou",
            "dia-periforas",
            "apofaseis-dimotikou-symvouliou",
        ],
    },
    {
        title: "Εκλογές & οικονομικά",
        slugs: ["dimotikes-ekloges-2028", "dimotikes-ekloges", "proypologismos-dimon"],
    },
];

/** Quick-search chips shown under the hero search bar. */
export const POPULAR_CHIPS = [
    "δημοτικό συμβούλιο",
    "δια περιφοράς",
    "δημοτικές εκλογές 2028",
    "προϋπολογισμός δήμου",
];

export const TOPIC_COUNT = Object.keys(TOPICS).length;

export function getTopic(slug: string): ExplainTopic | undefined {
    return TOPICS[slug];
}
