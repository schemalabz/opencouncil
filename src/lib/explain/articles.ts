/**
 * Article metadata for published /explain entries.
 *
 * The prose body of each article is bespoke and lives as a React component in
 * src/app/[locale]/(other)/explain/[slug]/bodies. This file holds the
 * structured data shared by metadata, the table of contents, the FAQ block and
 * the JSON-LD (Article + FAQPage) — everything an SEO crawler reads.
 */
import { ExplainCategory } from "./content";

export interface ArticleSource {
    label: string;
    meta: string;
    href?: string;
}

export interface ArticleFaq {
    question: string;
    answer: string;
}

export interface ArticleTocEntry {
    id: string;
    label: string;
}

export interface ExplainArticle {
    slug: string;
    title: string;
    /** Short meta description (≈150 chars) for <meta> and OG. */
    description: string;
    /** One-line "short answer" shown in the TL;DR box. */
    shortAnswer: string;
    category: ExplainCategory;
    /** Display label for the eyebrow (e.g. "Θεσμοί & όργανα"). */
    categoryLabel: string;
    updated: string;
    readingMinutes: number;
    toc: ArticleTocEntry[];
    sources: ArticleSource[];
    faqs: ArticleFaq[];
    /** Related-search chips for internal linking. */
    related: string[];
    /** Optional hero image; placeholder shown when absent. */
    image?: string;
}

export const ARTICLES: Record<string, ExplainArticle> = {
    "dimotika-symvoulia": {
        slug: "dimotika-symvoulia",
        title: "Τι είναι τα δημοτικά συμβούλια;",
        description:
            "Το δημοτικό συμβούλιο είναι το ανώτατο αποφασιστικό όργανο του δήμου. Δες τι είναι, πώς εκλέγεται, τι αποφασίζει και πώς να παρακολουθήσεις τη συνεδρίαση του δήμου σου.",
        shortAnswer:
            "Το δημοτικό συμβούλιο είναι το ανώτατο αποφασιστικό όργανο κάθε δήμου. Αποτελείται από αιρετούς δημοτικούς συμβούλους που εκλέγονται κάθε πέντε χρόνια και αποφασίζει για τα σημαντικότερα ζητήματα του δήμου — από τον προϋπολογισμό μέχρι τα τοπικά έργα και τους κανονισμούς.",
        category: "institutions",
        categoryLabel: "Θεσμοί & όργανα",
        image: "/explain/dimotika-symvoulia.svg",
        updated: "Μάιος 2026",
        readingMinutes: 5,
        toc: [
            { id: "orismos", label: "Ο ορισμός με δυο λόγια" },
            { id: "eklogi", label: "Πώς εκλέγεται" },
            { id: "apofasizei", label: "Τι αποφασίζει" },
            { id: "leitourgia", label: "Πώς λειτουργεί μια συνεδρίαση" },
            { id: "perifora", label: "Δια ζώσης & δια περιφοράς" },
            { id: "parakolouthisi", label: "Πώς θα την παρακολουθήσω" },
        ],
        sources: [
            {
                label: "Υπουργείο Εσωτερικών (ΥΠΕΣ)",
                meta: "Θεσμικό πλαίσιο αυτοδιοίκησης",
                href: "https://www.ypes.gr/",
            },
            {
                label: "Ν. 3463/2006 — Κώδικας Δήμων & Κοινοτήτων",
                meta: "Αρμοδιότητες & λειτουργία",
            },
            {
                label: "Ν. 3852/2010 — «Καλλικράτης»",
                meta: "Δομή αυτοδιοίκησης",
            },
            {
                label: "Ν. 4555/2018 — «Κλεισθένης Ι»",
                meta: "Εκλογικό σύστημα & λειτουργία",
            },
            {
                label: "ΚΕΔΕ",
                meta: "Κεντρική Ένωση Δήμων Ελλάδας",
                href: "https://www.kedke.gr/",
            },
        ],
        faqs: [
            {
                question: "Κάθε πότε συνεδριάζει το δημοτικό συμβούλιο;",
                answer:
                    "Τακτικά συνεδριάζει συνήθως μία φορά τον μήνα, ενώ μπορεί να συγκληθεί έκτακτα όποτε προκύψει επείγον ζήτημα ή το ζητήσει το ένα τρίτο των μελών.",
            },
            {
                question: "Είναι δημόσιες οι συνεδριάσεις;",
                answer:
                    "Ναι. Οι συνεδριάσεις είναι κατά κανόνα δημόσιες και ανοιχτές στους πολίτες. Σε εξαιρετικές περιπτώσεις μπορεί να γίνουν κεκλεισμένων των θυρών με ειδική απόφαση.",
            },
            {
                question: "Πόσα μέλη έχει ένα δημοτικό συμβούλιο;",
                answer:
                    "Εξαρτάται από τον πληθυσμό του δήμου — από 13 μέλη στους μικρότερους δήμους έως 45 ή περισσότερα στους μεγαλύτερους.",
            },
            {
                question: "Ποια η διαφορά δημοτικού συμβουλίου και δημοτικής επιτροπής;",
                answer:
                    "Το δημοτικό συμβούλιο είναι το ευρύ σώμα όλων των αιρετών. Η δημοτική επιτροπή είναι μικρότερο όργανο με πιο εξειδικευμένες, εκτελεστικές και οικονομικές αρμοδιότητες.",
            },
        ],
        related: [
            "αρμοδιοτητες δημοτικου συμβουλιου",
            "προεδρος δημοτικου συμβουλιου",
            "δια περιφορασ τι σημαινει",
            "αποφασεισ δημοτικου συμβουλιου",
            "τι κανει ο δημοτικος συμβουλος",
            "δημοτικο συμβουλιο live",
        ],
    },
};

export function getArticle(slug: string): ExplainArticle | undefined {
    return ARTICLES[slug];
}

export const PUBLISHED_ARTICLE_SLUGS = Object.keys(ARTICLES);
