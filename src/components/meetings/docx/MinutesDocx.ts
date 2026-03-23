import { el } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import {
    Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType,
    Table, TableRow, TableCell, WidthType, Bookmark, PageReference,
    InternalHyperlink,
} from 'docx';
import { formatTimestamp } from '@/lib/utils';
import { formatGapDuration } from '@/lib/formatters/time';
import { markdownToDocxParagraphs } from '@/lib/minutes/markdownToDocx';
import {
    MinutesData,
    MinutesSubject,
    MinutesAttendance,
} from '@/lib/minutes/types';

const FONT_SIZE = {
    TITLE: 32,      // 16pt
    SUBTITLE: 28,   // 14pt
    BODY: 22,       // 11pt
    HEADING: 26,    // 13pt
    SMALL: 20,      // 10pt
    CAPTION: 18,    // 9pt
};

/** Bookmark IDs must be alphanumeric + underscores */
function subjectBookmarkId(subject: MinutesSubject): string {
    return `subject_${subject.subjectId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function createTitlePage(data: MinutesData): Paragraph[] {
    const meetingDate = new Date(data.meeting.dateTime);

    return [
        new Paragraph({ spacing: { before: 2400 } }),

        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({
                text: data.city.name_municipality,
                size: FONT_SIZE.SUBTITLE,
            })],
        }),

        ...(data.administrativeBody ? [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({
                text: data.administrativeBody,
                size: FONT_SIZE.SUBTITLE,
            })],
        })] : []),

        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 400, after: 200 },
            children: [new TextRun({
                text: 'ΠΡΑΚΤΙΚΑ ΣΥΝΕΔΡΙΑΣΗΣ',
                size: FONT_SIZE.TITLE,
                bold: true,
            })],
        }),

        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({
                text: data.meeting.name,
                size: FONT_SIZE.SUBTITLE,
                bold: true,
            })],
        }),

        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [new TextRun({
                text: formatInTimeZone(meetingDate, data.city.timezone, 'EEEE, d MMMM yyyy, HH:mm', { locale: el }),
                size: FONT_SIZE.BODY,
            })],
        }),

        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
            children: [new TextRun({
                text: 'Προσοχή: Ανεπίσημο έγγραφο',
                color: 'FF6B00',
                bold: true,
                size: FONT_SIZE.BODY,
            })],
        }),

        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200 },
            children: [new TextRun({
                text: 'Παράγεται αυτόματα από το OpenCouncil',
                size: FONT_SIZE.SMALL,
                color: '666666',
            })],
        }),

        new Paragraph({ pageBreakBefore: true }),
    ];
}

function createAttendanceSection(attendance: MinutesAttendance): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 200 },
        children: [new TextRun({
            text: `ΠΑΡΟΝΤΕΣ (${attendance.present.length})`,
            size: FONT_SIZE.HEADING,
            bold: true,
        })],
    }));

    for (const member of attendance.present) {
        const children: TextRun[] = [
            new TextRun({ text: member.name, size: FONT_SIZE.BODY }),
        ];
        if (member.party) {
            const partyLabel = member.isPartyHead ? `${member.party}, Επικ.` : member.party;
            children.push(new TextRun({ text: ` (${partyLabel})`, size: FONT_SIZE.BODY, color: '666666' }));
        }
        if (member.role) {
            children.push(new TextRun({ text: ` — ${member.role}`, size: FONT_SIZE.SMALL, color: '666666', italics: true }));
        }
        paragraphs.push(new Paragraph({ bullet: { level: 0 }, spacing: { before: 40, after: 40 }, children }));
    }

    if (attendance.absent.length > 0) {
        paragraphs.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 360, after: 200 },
            children: [new TextRun({
                text: `ΑΠΟΝΤΕΣ (${attendance.absent.length})`,
                size: FONT_SIZE.HEADING,
                bold: true,
            })],
        }));

        for (const member of attendance.absent) {
            const children: TextRun[] = [
                new TextRun({ text: member.name, size: FONT_SIZE.BODY }),
            ];
            if (member.party) {
                children.push(new TextRun({ text: ` (${member.party})`, size: FONT_SIZE.BODY, color: '666666' }));
            }
            paragraphs.push(new Paragraph({ bullet: { level: 0 }, spacing: { before: 40, after: 40 }, children }));
        }
    }

    paragraphs.push(new Paragraph({ pageBreakBefore: true }));
    return paragraphs;
}

// --- TOC ---

function tocCell(text: string, bold: boolean): TableCell {
    return new TableCell({
        children: [new Paragraph({
            spacing: { before: 40, after: 40 },
            children: [new TextRun({ text, bold, size: FONT_SIZE.SMALL })],
        })],
    });
}

function createTOCTable(subjects: MinutesSubject[], useSequentialNumbers: boolean): Table {
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            tocCell('Α/Α', true),
            tocCell('Θέμα', true),
            tocCell('Αρ. Απόφασης', true),
            tocCell('Σελ.', true),
        ],
    });

    const dataRows = subjects.map((subject, index) => {
        const seqNum = useSequentialNumbers ? `${index + 1}` : `${subject.agendaItemIndex ?? ''}`;

        return new TableRow({
            children: [
                tocCell(seqNum, false),
                tocCell(subject.name, false),
                tocCell(subject.decision?.protocolNumber ?? '', false),
                new TableCell({
                    children: [new Paragraph({
                        spacing: { before: 40, after: 40 },
                        children: [new PageReference(subjectBookmarkId(subject))],
                    })],
                }),
            ],
        });
    });

    return new Table({
        columnWidths: [800, 5400, 1800, 800],
        rows: [headerRow, ...dataRows],
    });
}

function createTOCSections(subjects: MinutesSubject[]): (Paragraph | Table)[] {
    const elements: (Paragraph | Table)[] = [];

    const agenda = subjects.filter(s => s.nonAgendaReason !== 'outOfAgenda');
    const outOfAgenda = subjects.filter(s => s.nonAgendaReason === 'outOfAgenda');

    if (agenda.length > 0) {
        elements.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 360, after: 200 },
            children: [new TextRun({ text: 'ΘΕΜΑΤΑ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ', size: FONT_SIZE.HEADING, bold: true })],
        }));
        elements.push(createTOCTable(agenda, false));
    }

    if (outOfAgenda.length > 0) {
        elements.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: agenda.length > 0 ? 480 : 360, after: 200 },
            children: [new TextRun({ text: 'ΕΚΤΟΣ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ ΘΕΜΑΤΑ', size: FONT_SIZE.HEADING, bold: true })],
        }));
        elements.push(createTOCTable(outOfAgenda, true));
    }

    elements.push(new Paragraph({ pageBreakBefore: true }));
    return elements;
}

// --- Per-subject sections ---

function createSubjectSection(subject: MinutesSubject): (Paragraph | Table)[] {
    const paragraphs: (Paragraph | Table)[] = [];

    // Subject heading with bookmark for TOC page references
    const headingPrefix = subject.nonAgendaReason === 'outOfAgenda'
        ? null
        : subject.agendaItemIndex !== null
            ? `ΘΕΜΑ ${subject.agendaItemIndex}`
            : 'ΘΕΜΑ';

    const headingText = headingPrefix ? `${headingPrefix}: ${subject.name}` : subject.name;

    paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 480, after: 200 },
        children: [
            new Bookmark({
                id: subjectBookmarkId(subject),
                children: [new TextRun({ text: headingText, size: FONT_SIZE.HEADING, bold: true })],
            }),
        ],
    }));

    // "Discussed with" note for grouped subjects
    if (subject.discussedWith) {
        const prefix = subject.discussedWith.agendaItemIndex != null
            ? `ΘΕΜΑ ${subject.discussedWith.agendaItemIndex}: `
            : '';
        paragraphs.push(new Paragraph({
            spacing: { before: 0, after: 200 },
            children: [
                new TextRun({
                    text: 'Συζητήθηκε μαζί με ',
                    italics: true,
                    color: '666666',
                    size: FONT_SIZE.SMALL,
                }),
                new TextRun({
                    text: prefix,
                    italics: true,
                    color: '666666',
                    size: FONT_SIZE.SMALL,
                }),
                new InternalHyperlink({
                    anchor: subjectBookmarkId({ subjectId: subject.discussedWith.id } as MinutesSubject),
                    children: [new TextRun({
                        text: subject.discussedWith.name,
                        italics: true,
                        color: '4472C4',
                        size: FONT_SIZE.SMALL,
                    })],
                }),
            ],
        }));
    }

    // Transcript (no heading) — matches full transcript DOCX speaker attribution format
    for (const entry of subject.transcriptEntries) {
        if (entry.type === 'gap') {
            const gapChildren: (TextRun | InternalHyperlink)[] = [
                new TextRun({
                    text: `[Άλλη συζήτηση ${formatGapDuration(entry.durationSeconds)}`,
                    italics: true,
                    color: '999999',
                    size: FONT_SIZE.SMALL,
                }),
            ];
            if (entry.subjects.length > 0) {
                gapChildren.push(new TextRun({ text: ' — ', italics: true, color: '999999', size: FONT_SIZE.SMALL }));
                entry.subjects.forEach((s, j) => {
                    if (j > 0) gapChildren.push(new TextRun({ text: ', ', italics: true, color: '999999', size: FONT_SIZE.SMALL }));
                    gapChildren.push(new TextRun({ text: '«', italics: true, color: '999999', size: FONT_SIZE.SMALL }));
                    gapChildren.push(new InternalHyperlink({
                        anchor: subjectBookmarkId({ subjectId: s.id } as MinutesSubject),
                        children: [new TextRun({ text: s.name, italics: true, color: '4472C4', size: FONT_SIZE.SMALL })],
                    }));
                    gapChildren.push(new TextRun({ text: '»', italics: true, color: '999999', size: FONT_SIZE.SMALL }));
                });
            }
            gapChildren.push(new TextRun({ text: ']', italics: true, color: '999999', size: FONT_SIZE.SMALL }));
            paragraphs.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 120 },
                children: gapChildren,
            }));
            continue;
        }

        const partyLabel = entry.party
            ? entry.isPartyHead ? `(${entry.party}, Επικ.) ` : `(${entry.party}) `
            : '';
        const nameWithParty = `${entry.speakerName} ${partyLabel}`;
        const children: TextRun[] = [
            new TextRun({ text: nameWithParty, bold: true, size: FONT_SIZE.BODY }),
        ];
        if (entry.role) {
            children.push(new TextRun({ text: `${entry.role} `, size: FONT_SIZE.SMALL, color: '666666' }));
        }
        children.push(new TextRun({ text: formatTimestamp(entry.timestamp), size: FONT_SIZE.SMALL, color: '666666' }));
        children.push(new TextRun({ text: entry.text, size: FONT_SIZE.BODY, break: 1 }));

        paragraphs.push(new Paragraph({ children, spacing: { before: 160, after: 160 } }));
    }

    // Decision excerpt (no heading, extra spacing to separate from transcript)
    if (subject.decision?.excerpt) {
        paragraphs.push(new Paragraph({ spacing: { before: 360 } }));
        paragraphs.push(...markdownToDocxParagraphs(subject.decision.excerpt, { fontSize: FONT_SIZE.BODY }));
    }

    // --- Subject footer: attendance, dissenting votes, decision number ---

    if (subject.attendance) {
        const parts: string[] = [`Παρόντες: ${subject.attendance.present.length}`];
        if (subject.attendance.absent.length > 0) {
            parts.push(`Απόντες: ${subject.attendance.absent.length}`);
        }
        paragraphs.push(new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [new TextRun({ text: parts.join(' | '), size: FONT_SIZE.SMALL, color: '666666' })],
        }));
    }

    // Dissenting / abstain votes (only when not unanimous)
    if (subject.voteResult && !subject.voteResult.isUnanimous) {
        if (subject.voteResult.againstMembers.length > 0) {
            const names = subject.voteResult.againstMembers
                .map(m => m.party ? `${m.name} (${m.party}${m.isPartyHead ? ', Επικ.' : ''})` : m.name).join(', ');
            paragraphs.push(new Paragraph({
                spacing: { before: 60, after: 40 },
                children: [
                    new TextRun({ text: 'ΚΑΤΑ: ', bold: true, size: FONT_SIZE.SMALL }),
                    new TextRun({ text: names, size: FONT_SIZE.SMALL }),
                ],
            }));
        }
        if (subject.voteResult.abstainMembers.length > 0) {
            const names = subject.voteResult.abstainMembers
                .map(m => m.party ? `${m.name} (${m.party}${m.isPartyHead ? ', Επικ.' : ''})` : m.name).join(', ');
            paragraphs.push(new Paragraph({
                spacing: { before: 60, after: 40 },
                children: [
                    new TextRun({ text: 'ΛΕΥΚΑ: ', bold: true, size: FONT_SIZE.SMALL }),
                    new TextRun({ text: names, size: FONT_SIZE.SMALL }),
                ],
            }));
        }
    }

    // Decision number (right-aligned)
    if (subject.decision?.protocolNumber) {
        paragraphs.push(new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 120, after: 200 },
            children: [new TextRun({ text: `Αρ. Απόφασης: ${subject.decision.protocolNumber}`, size: FONT_SIZE.BODY, bold: true })],
        }));
    }

    return paragraphs;
}

function sectionHeading(text: string): Paragraph {
    return new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 300 },
        children: [new TextRun({ text, size: FONT_SIZE.HEADING, bold: true })],
    });
}

export async function renderMinutesDocx(data: MinutesData): Promise<Blob> {
    const children: (Paragraph | Table)[] = [];

    // Title page
    children.push(...createTitlePage(data));

    // Overall attendance
    if (data.overallAttendance) {
        children.push(...createAttendanceSection(data.overallAttendance));
    }

    // Table of contents (split into ΕΚΤΟΣ ΗΔ + ΗΔ tables)
    if (data.subjects.length > 0) {
        children.push(...createTOCSections(data.subjects));
    }

    // Split subjects into groups
    const agendaSubjects = data.subjects.filter(s => s.nonAgendaReason !== 'outOfAgenda');
    const outOfAgendaSubjects = data.subjects.filter(s => s.nonAgendaReason === 'outOfAgenda');

    // Regular agenda subjects
    if (agendaSubjects.length > 0) {
        children.push(sectionHeading('ΘΕΜΑΤΑ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ'));
        for (const subject of agendaSubjects) {
            children.push(...createSubjectSection(subject));
        }
    }

    // Out-of-agenda subjects
    if (outOfAgendaSubjects.length > 0) {
        children.push(sectionHeading('ΕΚΤΟΣ ΗΜΕΡΗΣΙΑΣ ΔΙΑΤΑΞΗΣ ΘΕΜΑΤΑ'));
        for (const subject of outOfAgendaSubjects) {
            children.push(...createSubjectSection(subject));
        }
    }

    const doc = new Document({
        creator: 'OpenCouncil',
        description: 'Πρακτικά Συνεδρίασης',
        title: data.meeting.name,
        subject: 'Πρακτικά',
        sections: [{
            properties: {},
            children,
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    return new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
}
