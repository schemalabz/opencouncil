import type { DocumentType } from "./types";

/**
 * The words that depend on what the text is. A study has chapters and articles; a regulation has
 * articles and numbered paragraphs, and nobody calls it a study.
 */
export interface DocumentWording {
    /** The full text: the title of its screen and of the links to it. */
    documentTitle: string;
    /** The full text, in the computer's bar. */
    documentLink: string;
    /** The title over a section that the reader opened from a link. */
    sectionTitle: string;
    /** The label over a top-level item's title: "Κεφάλαιο 4". */
    chapterLabel: (chapterNum: number | undefined) => string;
    /** The label over a second-level item's title: "Άρθρο 2", or "Παράγραφος 4.2". */
    articleLabel: (chapterNum: number | undefined, articleNum: number) => string;
    /** The same items, named outside the text: in a comment, an email and the printout. */
    chapterWhere: (chapterNum: number | undefined) => string;
    articleWhere: (chapterNum: number | undefined, articleNum: number) => string;
    chapterCount: (count: number) => string;
    articleCount: (count: number) => string;
    /** The comment link of a top-level item that has second-level items, and of one that has none. */
    commentOnChapter: string;
    commentOnChapterAlone: string;
    commentOnArticle: string;
    /** The heading over the comments on the text, in the printout. */
    printedCommentsTitle: string;
    loadFailed: string;
    empty: string;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const WORDING: Record<DocumentType, DocumentWording> = {
    study: {
        documentTitle: 'Ολόκληρη η μελέτη',
        documentLink: 'Η μελέτη',
        sectionTitle: 'Στη μελέτη',
        chapterLabel: chapterNum => `Κεφάλαιο ${chapterNum}`,
        articleLabel: (_chapterNum, articleNum) => `Άρθρο ${articleNum}`,
        chapterWhere: chapterNum => `Κεφάλαιο ${chapterNum} της μελέτης`,
        articleWhere: (chapterNum, articleNum) => `Ενότητα ${chapterNum}.${articleNum} της μελέτης`,
        chapterCount: n => count(n, 'κεφάλαιο', 'κεφάλαια'),
        articleCount: n => count(n, 'άρθρο', 'άρθρα'),
        commentOnChapter: 'Σχολιάστε όλο το κεφάλαιο',
        commentOnChapterAlone: 'Σχολιάστε αυτό το κεφάλαιο',
        commentOnArticle: 'Σχολιάστε αυτό το άρθρο',
        printedCommentsTitle: 'Σχόλια στα κεφάλαια και άρθρα της κανονιστικής',
        loadFailed: 'Δεν ήταν δυνατή η φόρτωση της μελέτης. Δοκιμάστε ξανά σε λίγο.',
        empty: 'Η μελέτη δεν έχει κεφάλαια.',
    },
    regulation: {
        documentTitle: 'Ολόκληρο το κείμενο',
        documentLink: 'Το κείμενο',
        sectionTitle: 'Στο κείμενο',
        chapterLabel: chapterNum => `Άρθρο ${chapterNum}`,
        articleLabel: (chapterNum, articleNum) => `Παράγραφος ${chapterNum}.${articleNum}`,
        chapterWhere: chapterNum => `Άρθρο ${chapterNum} του σχεδίου`,
        articleWhere: (chapterNum, articleNum) => `Παράγραφος ${chapterNum}.${articleNum} του σχεδίου`,
        chapterCount: n => count(n, 'άρθρο', 'άρθρα'),
        articleCount: n => count(n, 'παράγραφος', 'παράγραφοι'),
        commentOnChapter: 'Σχολιάστε όλο το άρθρο',
        commentOnChapterAlone: 'Σχολιάστε αυτό το άρθρο',
        commentOnArticle: 'Σχολιάστε αυτή την παράγραφο',
        printedCommentsTitle: 'Σχόλια στα άρθρα και στις παραγράφους του σχεδίου',
        loadFailed: 'Δεν ήταν δυνατή η φόρτωση του κειμένου. Δοκιμάστε ξανά σε λίγο.',
        empty: 'Το κείμενο δεν έχει άρθρα.',
    },
};

export function documentWording(documentType: DocumentType | undefined): DocumentWording {
    return WORDING[documentType ?? 'study'];
}
