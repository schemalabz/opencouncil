import {
    AlignmentType, Document, Header, HeadingLevel, PageNumber, PageOrientation, Packer, Paragraph,
    Tab, TabStopType, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType,
} from 'docx';
import { catalogText } from '@/i18n/catalogText';
import type { DecisionsTableData } from '@/lib/decisionsTable/getDecisionsTableData';
import { RESULT_MESSAGE_KEY, type DecisionTableRow } from '@/lib/decisionsTable/rows';
import { getWithdrawnLabelGreek } from '@/lib/minutes/builders';
import { voteCountsPhrase } from '@/lib/utils/votes';
import elDecisionsTable from '../../../../messages/el/decisionsTable.json';

const FONT_SIZE = { TITLE: 32, SUBTITLE: 26, BODY: 20, SMALL: 18, HEADER: 16 };
const HEADER_COLOR = '888888';

/**
 * A4 in twips. The section is landscape, and the `docx` library swaps the width
 * and the height it is given when the orientation is landscape — so it takes
 * the portrait values and prints a 16838 × 11906 page. Given the landscape
 * values, it printed a portrait page flagged landscape, and Word laid the
 * table out past the right edge.
 */
const A4 = { short: 11906, long: 16838 };
const MARGIN = 1134;
/** The width inside the margins of the landscape page: the table and the header's right tab stop both end here. */
const TEXT_WIDTH = A4.long - 2 * MARGIN;
/** Α/Α · Θέμα · Αρ. απόφασης · Περίληψη · Αποτέλεσμα, summing to {@link TEXT_WIDTH}. */
const COLUMN_WIDTHS = [700, 5000, 1500, 5000, 2370];

/**
 * The words the on-screen tables print, in Greek: the document is the
 * municipality's own record. Read from the same catalog, so the posted table
 * cannot name a result differently from the page.
 */
const t = catalogText({ messages: { decisionsTable: elDecisionsTable }, namespace: 'decisionsTable', locale: 'el' });

function stripDiacritics(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** A cell of a fixed-layout table: Word honours a width only when every cell states it. */
function cell(text: string, width: number, options: { bold?: boolean; muted?: boolean } = {}): TableCell {
    return new TableCell({
        width: { size: width, type: WidthType.DXA },
        children: [new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text, bold: options.bold, size: FONT_SIZE.SMALL, color: options.muted ? '666666' : undefined })],
        })],
    });
}

/** The result column: the word, and the counts behind it in parentheses, which the printed page cannot reveal on hover. */
function resultText(row: DecisionTableRow): string {
    if (row.result === 'withdrawn') return '—';
    const word = t(RESULT_MESSAGE_KEY[row.result]);
    return row.voteCounts ? `${word} (${voteCountsPhrase(t, row.voteCounts)})` : word;
}

/**
 * The summary cell. A summary read off the transcript keeps the label the panel
 * shows, so the back office does not post it as the decision's own text.
 */
function summaryText(row: DecisionTableRow): string {
    if (!row.summary) return '';
    return row.summary.source === 'discussion' ? `${row.summary.text} · ${t('fromDiscussion')}` : row.summary.text;
}

function numberText(row: DecisionTableRow): string {
    if (row.subject.withdrawn) return getWithdrawnLabelGreek(row.subject);
    if (!row.decision) return t('pending');
    return row.decision.number ?? '';
}

function sectionTable(rows: DecisionTableRow[], sequential: boolean): Table {
    const [indexWidth, subjectWidth, numberWidth, summaryWidth, resultWidth] = COLUMN_WIDTHS;
    const header = new TableRow({
        tableHeader: true,
        children: [
            cell(t('colIndex'), indexWidth, { bold: true }),
            cell(t('colSubject'), subjectWidth, { bold: true }),
            cell(t('colNumber'), numberWidth, { bold: true }),
            cell(t('colSummary'), summaryWidth, { bold: true }),
            cell(t('colResult'), resultWidth, { bold: true }),
        ],
    });
    const body = rows.map((row, index) => new TableRow({
        children: [
            cell(sequential ? `${index + 1}` : `${row.subject.agendaItemIndex ?? ''}`, indexWidth),
            cell(row.subject.name, subjectWidth),
            cell(numberText(row), numberWidth, { muted: row.decision === null }),
            cell(summaryText(row), summaryWidth),
            cell(resultText(row), resultWidth),
        ],
    }));
    return new Table({
        layout: TableLayoutType.FIXED,
        width: { size: TEXT_WIDTH, type: WidthType.DXA },
        columnWidths: COLUMN_WIDTHS,
        rows: [header, ...body],
    });
}

function heading(text: string): Paragraph {
    return new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
        children: [new TextRun({ text, bold: true, size: FONT_SIZE.SUBTITLE })],
    });
}

function centered(text: string, size: number, bold = false, after = 120): Paragraph {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after },
        children: [new TextRun({ text, size, bold })],
    });
}

/**
 * The Πίνακας αποφάσεων as a document the back office posts on the
 * municipality's website (ν. 5314/2026, άρθρο 133 §2): the subjects discussed,
 * the number of each decision, a summary of it, and the result with the vote
 * counts. An empty summary cell stays empty for the secretariat to fill in.
 *
 * The title block says each thing once: the municipality, the document, and
 * the meeting's label, which already names the body and the date.
 */
export async function renderDecisionsTableDocx(data: DecisionsTableData): Promise<Blob> {
    const children: (Paragraph | Table)[] = [
        centered(stripDiacritics(data.city.name_municipality.toUpperCase()), FONT_SIZE.SUBTITLE, true),
        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 120 },
            children: [new TextRun({ text: 'ΠΙΝΑΚΑΣ ΑΠΟΦΑΣΕΩΝ', bold: true, size: FONT_SIZE.TITLE })],
        }),
        centered(data.meeting.name, FONT_SIZE.SUBTITLE, true, 300),
    ];

    const outOfAgenda = data.table.rows.filter(row => row.section === 'outOfAgenda');
    const agenda = data.table.rows.filter(row => row.section === 'agenda');
    const both = outOfAgenda.length > 0 && agenda.length > 0;
    if (outOfAgenda.length > 0) {
        if (both) children.push(heading('ΘΕΜΑΤΑ ΕΚΤΟΣ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ'));
        children.push(sectionTable(outOfAgenda, true));
    }
    if (agenda.length > 0) {
        if (both) children.push(heading('ΘΕΜΑΤΑ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ'));
        children.push(sectionTable(agenda, false));
    }
    if (data.table.rows.length === 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: t('empty'), size: FONT_SIZE.BODY })] }));
    }
    if (data.table.beforeAgenda.length > 0) {
        children.push(new Paragraph({
            spacing: { before: 200 },
            children: [new TextRun({
                text: t('beforeAgenda', { n: data.table.beforeAgenda.length }),
                size: FONT_SIZE.SMALL, color: '666666',
            })],
        }));
    }

    // The running header names the document from the second page on; the first
    // page has the title block, so the header would only repeat it there.
    const headerStyle = { size: FONT_SIZE.HEADER, color: HEADER_COLOR };
    const header = new Header({
        children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
            children: [
                new TextRun({ children: [`${data.city.name_municipality} · ${data.meeting.name}`], ...headerStyle }),
                new TextRun({ children: [new Tab(), PageNumber.CURRENT], ...headerStyle }),
            ],
        })],
    });

    const doc = new Document({
        creator: 'OpenCouncil',
        description: 'Πίνακας αποφάσεων συνεδρίασης',
        title: `Πίνακας αποφάσεων — ${data.meeting.name}`,
        subject: 'Πίνακας αποφάσεων',
        sections: [{
            properties: {
                titlePage: true,
                page: {
                    size: { orientation: PageOrientation.LANDSCAPE, width: A4.short, height: A4.long },
                    margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
                },
            },
            headers: { default: header, first: new Header({ children: [] }) },
            children,
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
