import JSZip from 'jszip';
import { renderDecisionsTableDocx } from '../DecisionsTableDocx';
import type { DecisionsTableData } from '@/lib/decisionsTable/getDecisionsTableData';
import type { DecisionTableRow } from '@/lib/decisionsTable/rows';

type RowOverrides = Omit<Partial<DecisionTableRow>, 'subject'> & { subject?: Partial<DecisionTableRow['subject']> };

const row = ({ subject, ...rest }: RowOverrides = {}): DecisionTableRow => ({
    subject: { id: 's1', name: 'Έγκριση προϋπολογισμού', agendaItemIndex: 1, nonAgendaReason: null, withdrawn: false, ...subject },
    section: 'agenda',
    decision: { number: '12/2026', pdfUrl: 'https://diavgeia.gov.gr/doc/x', ada: 'ΑΔΑ' },
    result: 'majority',
    voteCounts: { forCount: 18, againstCount: 12, abstainCount: 0, presentCount: 0, didNotVoteCount: 0, passed: true, isUnanimous: false },
    summary: { text: 'Εγκρίνει τον προϋπολογισμό του 2026.', source: 'document' },
    ...rest,
});

function data(rows: DecisionTableRow[], beforeAgenda: DecisionsTableData['table']['beforeAgenda'] = []): DecisionsTableData {
    return {
        city: { name_municipality: 'Δήμος Ζωγράφου', timezone: 'Europe/Athens' },
        meeting: { id: 'm1', cityId: 'zografou', name: 'Δημοτικό Συμβούλιο · 3η Τακτική · 21/07/2026', dateTime: '2026-07-21T16:00:00.000Z' },
        table: { rows, beforeAgenda },
    };
}

async function documentText(blob: Blob): Promise<string> {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    return (await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, ' ');
}

describe('renderDecisionsTableDocx', () => {
    it('prints the title block, the number, the summary, and the result with its counts', async () => {
        const text = await documentText(await renderDecisionsTableDocx(data([row()])));
        expect(text).toContain('ΔΗΜΟΣ ΖΩΓΡΑΦΟΥ');
        expect(text).toContain('ΠΙΝΑΚΑΣ ΑΠΟΦΑΣΕΩΝ');
        expect(text).toContain('Δημοτικό Συμβούλιο · 3η Τακτική · 21/07/2026');
        // The body and the date are in the label; no line prints them again.
        expect(text.match(/Δημοτικό Συμβούλιο/g)).toHaveLength(1);
        expect(text).not.toContain('21 Ιουλίου 2026');
        expect(text).toContain('12/2026');
        expect(text).toContain('Εγκρίνει τον προϋπολογισμό του 2026.');
        expect(text).toContain('Κατά πλειοψηφία (18 υπέρ, 12 κατά)');
    });

    it('labels a summary read off the transcript, and only that one', async () => {
        const text = await documentText(await renderDecisionsTableDocx(data([
            row({ subject: { id: 'a1' } }),
            row({ subject: { id: 'a2', agendaItemIndex: 2 }, decision: null, result: 'none', voteCounts: null, summary: { text: 'Ενέκρινε την αναμόρφωση.', source: 'discussion' } }),
        ])));
        expect(text).toContain('Ενέκρινε την αναμόρφωση. · Από τη συζήτηση');
        expect(text).toContain('Εγκρίνει τον προϋπολογισμό του 2026.');
        expect(text.match(/Από τη συζήτηση/g)).toHaveLength(1);
    });

    it('says a missing decision is pending and leaves its summary cell empty', async () => {
        const text = await documentText(await renderDecisionsTableDocx(data([
            row({ decision: null, result: 'none', voteCounts: null, summary: null }),
        ])));
        expect(text).toContain('Εκκρεμεί');
        expect(text).not.toContain('undefined');
    });

    it('labels a withdrawn subject instead of a number, with no result', async () => {
        const text = await documentText(await renderDecisionsTableDocx(data([
            row({ subject: { withdrawn: true }, decision: null, result: 'withdrawn', voteCounts: null, summary: null }),
        ])));
        expect(text).toContain('Αποσύρθηκε');
    });

    it('splits the two registers under their own headings, and counts the pre-agenda subjects in a line', async () => {
        const text = await documentText(await renderDecisionsTableDocx(data(
            [
                row({ subject: { id: 'out', agendaItemIndex: null, nonAgendaReason: 'outOfAgenda' }, section: 'outOfAgenda' }),
                row(),
            ],
            [{ id: 'b', name: 'Ερώτηση' }, { id: 'c', name: 'Ανακοίνωση' }],
        )));
        expect(text).toContain('ΘΕΜΑΤΑ ΕΚΤΟΣ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ');
        expect(text).toContain('ΘΕΜΑΤΑ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ');
        expect(text).toContain('Πριν από την ημερήσια διάταξη · 2 θέματα');
    });

    it('prints a landscape page: wider than tall, with a fixed-width table inside its margins', async () => {
        const zip = await JSZip.loadAsync(await (await renderDecisionsTableDocx(data([row()]))).arrayBuffer());
        const xml = await zip.file('word/document.xml')!.async('string');
        // The library swaps the sizes it is given for a landscape section; what matters is what it writes.
        expect(xml).toMatch(/<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
        expect(xml).toMatch(/<w:tblLayout w:type="fixed"\/>/);
        expect(xml).toMatch(/<w:tblW w:type="dxa" w:w="14570"\/>/);
    });

    it('puts the page number at the right margin of the landscape page, and no header on the first page', async () => {
        const zip = await JSZip.loadAsync(await (await renderDecisionsTableDocx(data([row()]))).arrayBuffer());
        const headers = await Promise.all(Object.keys(zip.files).filter(name => /^word\/header\d*\.xml$/.test(name)).map(name => zip.file(name)!.async('string')));
        expect(headers.some(header => /w:tab w:val="right" w:pos="14570"/.test(header))).toBe(true);
        expect(await zip.file('word/document.xml')!.async('string')).toMatch(/<w:titlePg\/>/);
    });
});
