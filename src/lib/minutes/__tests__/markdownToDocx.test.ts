import { markdownToDocxParagraphs } from '../markdownToDocx';
import { Paragraph, Table, TextRun } from 'docx';

type DocxElement = Paragraph | Table;

/** Extract text content from a TextRun */
function getTextRunText(run: TextRun): string {
    // TextRun stores text in its internal properties
    const props = (run as unknown as Record<string, unknown>)['root'] as Array<Record<string, unknown>> | undefined;
    if (!props) return '';
    for (const item of props) {
        if (item['rootKey'] === 'w:t') {
            const root = item['root'] as Array<unknown> | undefined;
            return root ? String(root[root.length - 1] ?? '') : '';
        }
    }
    return '';
}

/** Extract all text from a paragraph by joining its TextRuns */
function getParagraphText(paragraph: DocxElement): string {
    const root = (paragraph as unknown as Record<string, unknown>)['root'] as Array<Record<string, unknown>> | undefined;
    if (!root) return '';
    const texts: string[] = [];
    for (const item of root) {
        if (item['rootKey'] === 'w:r') {
            const runRoot = item['root'] as Array<Record<string, unknown>> | undefined;
            if (!runRoot) continue;
            for (const child of runRoot) {
                if (child['rootKey'] === 'w:t') {
                    const textRoot = child['root'] as Array<unknown> | undefined;
                    if (textRoot) {
                        texts.push(String(textRoot[textRoot.length - 1] ?? ''));
                    }
                }
            }
        }
    }
    return texts.join('');
}

/** Check if any TextRun in a paragraph has bold formatting */
function hasBoldRun(paragraph: DocxElement): boolean {
    const root = (paragraph as unknown as Record<string, unknown>)['root'] as Array<Record<string, unknown>> | undefined;
    if (!root) return false;
    for (const item of root) {
        if (item['rootKey'] === 'w:r') {
            const runRoot = item['root'] as Array<Record<string, unknown>> | undefined;
            if (!runRoot) continue;
            for (const child of runRoot) {
                if (child['rootKey'] === 'w:rPr') {
                    const prRoot = child['root'] as Array<Record<string, unknown>> | undefined;
                    if (prRoot?.some(p => p['rootKey'] === 'w:b')) return true;
                }
            }
        }
    }
    return false;
}

/** Check if a paragraph has center alignment */
function isCenterAligned(paragraph: DocxElement): boolean {
    const root = (paragraph as unknown as Record<string, unknown>)['root'] as Array<Record<string, unknown>> | undefined;
    if (!root) return false;
    for (const item of root) {
        if (item['rootKey'] === 'w:pPr') {
            const prRoot = item['root'] as Array<Record<string, unknown>> | undefined;
            if (!prRoot) continue;
            for (const child of prRoot) {
                if (child['rootKey'] === 'w:jc') {
                    const attrs = child['root'] as Array<Record<string, unknown>> | undefined;
                    if (attrs) {
                        for (const attr of attrs) {
                            const attrRoot = (attr as Record<string, unknown>)['root'] as Record<string, string> | undefined;
                            if (attrRoot?.['val'] === 'center') return true;
                        }
                    }
                }
            }
        }
    }
    return false;
}

describe('markdownToDocxParagraphs', () => {
    it('should return empty array for empty string', () => {
        expect(markdownToDocxParagraphs('')).toHaveLength(0);
    });

    it('should create a paragraph for plain text', () => {
        const result = markdownToDocxParagraphs('Hello world');
        expect(result).toHaveLength(1);
        expect(getParagraphText(result[0])).toBe('Hello world');
    });

    it('should handle multiple paragraphs separated by newlines', () => {
        const result = markdownToDocxParagraphs('First paragraph\n\nSecond paragraph');
        expect(result).toHaveLength(2);
        expect(getParagraphText(result[0])).toBe('First paragraph');
        expect(getParagraphText(result[1])).toBe('Second paragraph');
    });

    it('should skip empty lines without creating extra paragraphs', () => {
        const result = markdownToDocxParagraphs('Line 1\n\n\n\nLine 2');
        expect(result).toHaveLength(2);
    });

    it('should parse bold formatting', () => {
        const result = markdownToDocxParagraphs('This is **bold** text');
        expect(result).toHaveLength(1);
        expect(getParagraphText(result[0])).toBe('This is bold text');
        expect(hasBoldRun(result[0])).toBe(true);
    });

    it('should handle bullet lists with dash', () => {
        const result = markdownToDocxParagraphs('- Item one\n- Item two\n- Item three');
        expect(result).toHaveLength(3);
        expect(getParagraphText(result[0])).toBe('Item one');
        expect(getParagraphText(result[1])).toBe('Item two');
        expect(getParagraphText(result[2])).toBe('Item three');
    });

    it('should handle bullet lists with asterisk', () => {
        const result = markdownToDocxParagraphs('* Item one\n* Item two');
        expect(result).toHaveLength(2);
        expect(getParagraphText(result[0])).toBe('Item one');
    });

    it('should handle numbered lists', () => {
        const result = markdownToDocxParagraphs('1. First\n2. Second\n3. Third');
        expect(result).toHaveLength(3);
        expect(getParagraphText(result[0])).toBe('1. First');
        expect(getParagraphText(result[1])).toBe('2. Second');
        expect(getParagraphText(result[2])).toBe('3. Third');
    });

    it('should handle mixed content types', () => {
        const md = `Introduction paragraph

- Bullet one
- Bullet two

1. Numbered one
2. Numbered two

Closing paragraph`;
        const result = markdownToDocxParagraphs(md);
        // 1 intro + 2 bullets + 2 numbered + 1 closing = 6
        expect(result).toHaveLength(6);
        expect(getParagraphText(result[0])).toBe('Introduction paragraph');
        expect(getParagraphText(result[5])).toBe('Closing paragraph');
    });

    it('should respect custom fontSize option', () => {
        const result = markdownToDocxParagraphs('Test', { fontSize: 28 });
        expect(result).toHaveLength(1);
        // We verify it doesn't crash with custom fontSize — the actual size is in internal properties
    });

    it('should center-align ΑΠΟΦΑΣΙΖΕΙ lines', () => {
        const result = markdownToDocxParagraphs('Λαμβάνοντας υπόψη τα ανωτέρω\n\nΑΠΟΦΑΣΙΖΕΙ\n\nΕγκρίνει την πρόταση');
        expect(result).toHaveLength(3);
        expect(isCenterAligned(result[0])).toBe(false);
        expect(isCenterAligned(result[1])).toBe(true);
        expect(isCenterAligned(result[2])).toBe(false);
    });

    it('should center-align bold **ΑΠΟΦΑΣΙΖΕΙ** lines', () => {
        const result = markdownToDocxParagraphs('**ΑΠΟΦΑΣΙΖΕΙ**');
        expect(result).toHaveLength(1);
        expect(isCenterAligned(result[0])).toBe(true);
    });

    it('should center-align "αποφασίζει" municipality-style lines', () => {
        const result = markdownToDocxParagraphs('Το Δημοτικό Συμβούλιο Χαλανδρίου αποφασίζει ομόφωνα');
        expect(result).toHaveLength(1);
        expect(isCenterAligned(result[0])).toBe(true);
    });

    it('should not center-align regular paragraphs', () => {
        const result = markdownToDocxParagraphs('Εγκρίνει ομόφωνα την πρόταση');
        expect(result).toHaveLength(1);
        expect(isCenterAligned(result[0])).toBe(false);
    });

    it('should handle real-world Greek legal text', () => {
        const legalText = `Λαμβάνοντας υπόψη:

- Τον Ν. 3852/2010 **«Καλλικράτης»**
- Τον Ν. 4555/2018 «Κλεισθένης Ι»

1. Εγκρίνει ομόφωνα την πρόταση
2. Εξουσιοδοτεί τον Δήμαρχο`;
        const result = markdownToDocxParagraphs(legalText);
        expect(result.length).toBeGreaterThanOrEqual(5);
        // Second bullet should contain bold text
        expect(hasBoldRun(result[1])).toBe(true);
    });
});
