import { readFile } from 'fs/promises';
import { join } from 'path';
import { el } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';
import {
    Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign, Bookmark, PageReference,
    InternalHyperlink, ImageRun, Header, PageNumber, Tab, TabStopType,
    TabStopPosition,
} from 'docx';
import { formatTimestamp } from '@/lib/utils';
import { formatGapDuration } from '@/lib/formatters/time';
import { getAbsentLabel, extractFirstName } from '@/lib/formatters/name';
import { markdownToDocxParagraphs } from '@/lib/minutes/markdownToDocx';
import { getWithdrawnLabel } from '@/lib/utils/subjects';
import {
    MinutesData,
    MinutesSubject,
    MinutesMember,
    MinutesCouncilComposition,
    MinutesTranscriptEntry,
} from '@/lib/minutes/types';

const FONT_SIZE = {
    TITLE: 32,      // 16pt
    SUBTITLE: 28,   // 14pt
    BODY: 22,       // 11pt
    HEADING: 26,    // 13pt
    SMALL: 20,      // 10pt
    CAPTION: 18,    // 9pt
};

const HEADER_FONT_SIZE = 16; // 8pt
const HEADER_COLOR = '888888';

/** Bookmark IDs must be alphanumeric + underscores */
function subjectBookmarkId(subject: MinutesSubject): string {
    return `subject_${subject.subjectId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

const BRANDING_FONT = 'Relative Book Pro';

/** Strip Greek diacritics — uppercase Greek convention omits accents (τόνοι). */
function stripDiacritics(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Detect image type from magic bytes in the buffer. */
function detectImageType(buf: Buffer): 'png' | 'jpg' | 'gif' | 'bmp' {
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
    if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpg';
    if (buf[0] === 0x47 && buf[1] === 0x49) return 'gif';
    if (buf[0] === 0x42 && buf[1] === 0x4D) return 'bmp';
    return 'png'; // fallback
}

/** Read image dimensions from buffer headers (PNG and JPEG). */
function getImageDimensions(buf: Buffer, type: string): { width: number; height: number } | null {
    if (type === 'png' && buf.length >= 24) {
        // PNG: IHDR chunk at offset 16 — width (4 bytes BE), height (4 bytes BE)
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (type === 'jpg' && buf.length >= 4) {
        // JPEG: scan for SOF0/SOF2 marker (0xFF 0xC0 or 0xFF 0xC2)
        let i = 2;
        while (i < buf.length - 9) {
            if (buf[i] !== 0xFF) { i++; continue; }
            const marker = buf[i + 1];
            if (marker === 0xC0 || marker === 0xC2) {
                return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
            }
            // Skip to next marker using segment length
            const segLen = buf.readUInt16BE(i + 2);
            i += 2 + segLen;
        }
    }
    return null;
}

/**
 * Scale image to fit within a bounding box (in points) while preserving aspect ratio.
 * Uses native pixel dimensions only to compute the ratio — the output size is
 * determined entirely by maxWidth/maxHeight, so the logo always occupies the
 * intended amount of page real estate regardless of source resolution.
 */
function scaleImage(buf: Buffer, type: string, maxWidth: number, maxHeight: number): { width: number; height: number } {
    const dims = getImageDimensions(buf, type);
    if (!dims) return { width: maxWidth, height: maxHeight };
    const ratio = dims.width / dims.height;
    // Fit within the bounding box: if wider than tall, width is the constraint; otherwise height
    if (ratio >= maxWidth / maxHeight) {
        return { width: maxWidth, height: Math.round(maxWidth / ratio) };
    }
    return { width: Math.round(maxHeight * ratio), height: maxHeight };
}

// --- Image fetching ---

interface FetchedImage {
    data: Buffer;
    type: 'png' | 'jpg' | 'gif' | 'bmp';
}

async function fetchImageBuffer(url: string): Promise<FetchedImage | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = Buffer.from(await response.arrayBuffer());
        return { data, type: detectImageType(data) };
    } catch {
        return null;
    }
}

async function getOpenCouncilLogo(): Promise<Buffer | null> {
    try {
        return await readFile(join(process.cwd(), 'public', 'logo.png'));
    } catch {
        return null;
    }
}

// --- Headers (book-style even/odd) ---

function createHeaders(data: MinutesData): {
    default: Header;
    even: Header;
    first: Header;
} {
    const headerStyle = { size: HEADER_FONT_SIZE, color: HEADER_COLOR };

    // Even pages (left side of book): [page number] ........... ΠΡΑΚΤΙΚΑ ΣΥΝΕΔΡΙΑΣΗΣ · Municipality
    const even = new Header({
        children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
                new TextRun({ children: [PageNumber.CURRENT], ...headerStyle }),
                new TextRun({ children: [new Tab(), `ΠΡΑΚΤΙΚΑ ΣΥΝΕΔΡΙΑΣΗΣ · ${data.city.name_municipality}`], ...headerStyle }),
            ],
        })],
    });

    // Odd pages (right side of book): Meeting name ........... [page number]
    const defaultHeader = new Header({
        children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
                new TextRun({ children: [data.meeting.name], ...headerStyle }),
                new TextRun({ children: [new Tab(), PageNumber.CURRENT], ...headerStyle }),
            ],
        })],
    });

    // Title page: no header
    const first = new Header({ children: [] });

    return { default: defaultHeader, even, first };
}

// --- Title page ---

function createTitlePage(
    data: MinutesData,
    cityLogo: FetchedImage | null,
    ocLogoBuffer: Buffer | null,
): (Paragraph | Table)[] {
    const meetingDate = new Date(data.meeting.dateTime);
    const paragraphs: (Paragraph | Table)[] = [];

    // Municipality logo — scaled to fit within 200x200pt preserving aspect ratio
    if (cityLogo) {
        const logoDims = scaleImage(cityLogo.data, cityLogo.type, 200, 200);
        paragraphs.push(new Paragraph({ spacing: { before: 1200 } }));
        paragraphs.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new ImageRun({
                data: cityLogo.data,
                transformation: logoDims,
                type: cityLogo.type,
            })],
        }));
        paragraphs.push(new Paragraph({ spacing: { after: 200 } }));
    } else {
        paragraphs.push(new Paragraph({ spacing: { before: 2400 } }));
    }

    // Municipality name — uppercase without accents (Greek typographic convention)
    paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({
            text: stripDiacritics(data.city.name_municipality.toUpperCase()),
            size: FONT_SIZE.SUBTITLE,
            bold: true,
        })],
    }));

    // Administrative body
    if (data.administrativeBody) {
        paragraphs.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({
                text: data.administrativeBody.name,
                size: FONT_SIZE.SUBTITLE,
            })],
        }));
    }

    // Decorative separator
    paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 300, after: 300 },
        children: [new TextRun({
            text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            color: 'CCCCCC',
            size: FONT_SIZE.BODY,
        })],
    }));

    // Main title
    paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({
            text: 'ΠΡΑΚΤΙΚΑ ΣΥΝΕΔΡΙΑΣΗΣ',
            size: FONT_SIZE.TITLE,
            bold: true,
        })],
    }));

    // Meeting name
    paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({
            text: data.meeting.name,
            size: FONT_SIZE.SUBTITLE,
            bold: true,
        })],
    }));

    // Date
    paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({
            text: formatInTimeZone(meetingDate, data.city.timezone, 'EEEE, d MMMM yyyy, HH:mm', { locale: el }),
            size: FONT_SIZE.BODY,
        })],
    }));

    // Decorative separator
    paragraphs.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 300, after: 300 },
        children: [new TextRun({
            text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            color: 'CCCCCC',
            size: FONT_SIZE.BODY,
        })],
    }));

    // Spacer to push OpenCouncil branding toward the bottom
    paragraphs.push(new Paragraph({ spacing: { before: 2400 } }));

    // OpenCouncil branding — logo aligned with "OpenCouncil" name, subtitle lines below
    const noBorders = {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
    };

    if (ocLogoBuffer) {
        const ocLogoDims = scaleImage(ocLogoBuffer, 'png', 40, 40);
        const logoCell = new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            width: { size: 700, type: WidthType.DXA },
            borders: noBorders,
            children: [new Paragraph({
                children: [new ImageRun({
                    data: ocLogoBuffer,
                    transformation: ocLogoDims,
                    type: 'png',
                })],
            })],
        });
        const nameCell = new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            borders: noBorders,
            children: [new Paragraph({
                children: [new TextRun({
                    text: 'OpenCouncil',
                    size: FONT_SIZE.BODY,
                    color: '888888',
                    font: BRANDING_FONT,
                })],
            })],
        });
        paragraphs.push(new Table({
            columnWidths: [700, 8100],
            rows: [new TableRow({ children: [logoCell, nameCell] })],
        }));
    } else {
        paragraphs.push(new Paragraph({
            spacing: { after: 20 },
            children: [new TextRun({ text: 'OpenCouncil', size: FONT_SIZE.BODY, color: '888888', font: BRANDING_FONT })],
        }));
    }

    // Tagline and URL below, indented to align with the text column
    const brandingIndent = 700; // matches logo column width in twips
    paragraphs.push(new Paragraph({
        spacing: { before: 40, after: 20 },
        indent: { left: brandingIndent },
        children: [new TextRun({
            text: 'Το λειτουργικό σύστημα των συλλογικών οργάνων',
            size: FONT_SIZE.CAPTION,
            color: 'AAAAAA',
            italics: true,
        })],
    }));
    paragraphs.push(new Paragraph({
        indent: { left: brandingIndent },
        children: [new TextRun({
            text: `opencouncil.gr/${data.meeting.cityId}`,
            size: FONT_SIZE.CAPTION,
            color: 'AAAAAA',
        })],
    }));

    paragraphs.push(new Paragraph({ pageBreakBefore: true }));
    return paragraphs;
}

/**
 * Renders the composition section and absent members for the meeting body.
 * Adapts to the administrative body type:
 * - Council: ΔΗΜΑΡΧΟΣ + ΠΡΟΕΔΡΟΣ + ΣΥΝΘΕΣΗ ΔΗΜΟΤΙΚΟΥ ΣΥΜΒΟΥΛΙΟΥ (flat list)
 * - Committee: ΠΡΟΕΔΡΟΣ + ΤΑΚΤΙΚΑ ΜΕΛΗ + ΑΝΑΠΛΗΡΩΜΑΤΙΚΑ ΜΕΛΗ
 *
 * @param composition - Members, substitute members, mayor, and president
 * @param absentMembers - Members absent at session start, or null if no roll call data
 * @param adminBody - Administrative body info (name and type) for heading and layout
 */
function createCouncilCompositionSection(
    composition: MinutesCouncilComposition,
    absentMembers: MinutesMember[] | null,
    adminBody: { name: string; type: string } | null,
): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const absentPersonIds = new Set(absentMembers?.map(m => m.personId) ?? []);
    const isCommittee = adminBody?.type === 'committee';

    // For councils: show mayor separately, then president
    // For committees: president IS the mayor, shown as ΠΡΟΕΔΡΟΣ only
    if (!isCommittee && composition.mayor) {
        const isAbsent = absentPersonIds.has(composition.mayor.personId);
        paragraphs.push(new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [
                new TextRun({ text: 'ΔΗΜΑΡΧΟΣ: ', bold: true, size: FONT_SIZE.BODY }),
                new TextRun({ text: composition.mayor.name, size: FONT_SIZE.BODY }),
                ...(isAbsent ? [new TextRun({ text: ` (${getAbsentLabel(extractFirstName(composition.mayor.name, 'surnameFirst'))})`, size: FONT_SIZE.BODY, color: '666666' })] : []),
            ],
        }));
    }

    if (composition.president) {
        const isAbsent = absentPersonIds.has(composition.president.personId);
        const presidentSuffix = isCommittee ? ' (ΔΗΜΑΡΧΟΣ)' : '';
        paragraphs.push(new Paragraph({
            spacing: { before: isCommittee ? 200 : 80, after: 200 },
            children: [
                new TextRun({ text: 'ΠΡΟΕΔΡΟΣ: ', bold: true, size: FONT_SIZE.BODY }),
                new TextRun({ text: composition.president.name + presidentSuffix, size: FONT_SIZE.BODY }),
                ...(isAbsent ? [new TextRun({ text: ` (${getAbsentLabel(extractFirstName(composition.president.name, 'surnameFirst'))})`, size: FONT_SIZE.BODY, color: '666666' })] : []),
            ],
        }));
    }

    // Council: composition heading. Committees skip — go straight to ΠΑΡΟΝΤΑ/ΑΠΟΝΤΑ ΜΕΛΗ.
    if (!isCommittee) {
        paragraphs.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 360, after: 200 },
            children: [new TextRun({
                text: `ΣΥΝΘΕΣΗ ΔΗΜΟΤΙΚΟΥ ΣΥΜΒΟΥΛΙΟΥ (${composition.members.length})`,
                size: FONT_SIZE.HEADING,
                bold: true,
            })],
        }));
    }

    // Council: flat member list. Committees skip this — members shown in ΠΑΡΟΝΤΕΣ/ΑΠΟΝΤΕΣ below.
    if (!isCommittee) {
        for (const member of composition.members) {
            const children: TextRun[] = [
                new TextRun({ text: member.name, size: FONT_SIZE.BODY }),
            ];
            if (member.party) {
                const partyLabel = member.isPartyHead ? `${member.party}, Επικεφαλής` : member.party;
                children.push(new TextRun({ text: ` (${partyLabel})`, size: FONT_SIZE.BODY, color: '666666' }));
            }
            paragraphs.push(new Paragraph({ bullet: { level: 0 }, spacing: { before: 40, after: 40 }, children }));
        }
    }

    // Attendance section — format depends on body type
    if (isCommittee && absentMembers) {
        // Committee: ΠΑΡΟΝΤΑ ΜΕΛΗ and ΑΠΟΝΤΑ ΜΕΛΗ as bullet lists
        const substituteIds = new Set(composition.substituteMembers.map(m => m.personId));
        const absentPersonIds = new Set(absentMembers.map(m => m.personId));
        const allMembers = [...composition.members, ...composition.substituteMembers];

        const presentList = allMembers.filter(m => !absentPersonIds.has(m.personId));
        const absentList = allMembers.filter(m => absentPersonIds.has(m.personId));

        const memberBullet = (m: MinutesMember) => {
            const children: TextRun[] = [new TextRun({ text: m.name, size: FONT_SIZE.BODY })];
            const labels: string[] = [];
            if (substituteIds.has(m.personId)) labels.push('αναπλ. μέλος');
            if (m.party) labels.push(m.isPartyHead ? `${m.party}, Επικεφαλής` : m.party);
            if (labels.length > 0) {
                children.push(new TextRun({ text: ` (${labels.join(', ')})`, size: FONT_SIZE.BODY, color: '666666' }));
            }
            return new Paragraph({ bullet: { level: 0 }, spacing: { before: 40, after: 40 }, children });
        };

        if (presentList.length > 0) {
            paragraphs.push(new Paragraph({
                spacing: { before: 200, after: 80 },
                children: [new TextRun({ text: `ΠΑΡΟΝΤΑ ΜΕΛΗ (${presentList.length})`, bold: true, size: FONT_SIZE.BODY })],
            }));
            for (const m of presentList) paragraphs.push(memberBullet(m));
        }
        if (absentList.length > 0) {
            paragraphs.push(new Paragraph({
                spacing: { before: 200, after: 80 },
                children: [new TextRun({ text: `ΑΠΟΝΤΑ ΜΕΛΗ (${absentList.length})`, bold: true, size: FONT_SIZE.BODY })],
            }));
            for (const m of absentList) paragraphs.push(memberBullet(m));
        }
    } else {
        // Council: absent inline sentence
        const absentListMembers = absentMembers?.filter(m =>
            (!composition.mayor || m.personId !== composition.mayor.personId) &&
            (!composition.president || m.personId !== composition.president.personId)
        );
        if (absentListMembers && absentListMembers.length > 0) {
            paragraphs.push(new Paragraph({
                spacing: { before: 200, after: 80 },
                children: [
                    new TextRun({ text: 'Κατά την έναρξη της συνεδρίασης απουσίαζαν οι ', size: FONT_SIZE.BODY }),
                    new TextRun({ text: absentListMembers.map(m => m.name).join(', '), size: FONT_SIZE.BODY }),
                    new TextRun({ text: ` (${absentListMembers.length})`, size: FONT_SIZE.BODY, color: '666666' }),
                ],
            }));
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
        const decisionText = subject.withdrawn
            ? getWithdrawnLabel(subject)
            : (subject.decision?.protocolNumber ?? '');

        return new TableRow({
            children: [
                tocCell(seqNum, false),
                tocCell(subject.name, false),
                tocCell(decisionText, false),
                // No page reference for withdrawn subjects (no subject block to link to)
                subject.withdrawn
                    ? tocCell('', false)
                    : new TableCell({
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

    const agenda = subjects
        .filter(s => s.nonAgendaReason !== 'outOfAgenda')
        .sort((a, b) => (a.agendaItemIndex ?? 0) - (b.agendaItemIndex ?? 0));
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

// --- Transcript entries → DOCX paragraphs ---

function createTranscriptParagraphs(entries: MinutesTranscriptEntry[]): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    for (const entry of entries) {
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
            ? entry.isPartyHead ? `(${entry.party}, Επικεφαλής) ` : `(${entry.party}) `
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

    return paragraphs;
}

// --- Per-subject sections ---

function createSubjectSection(subject: MinutesSubject): (Paragraph | Table)[] {
    const paragraphs: (Paragraph | Table)[] = [];

    // Orphaned utterances between previous subject and this one
    if (subject.preDiscussionEntries.length > 0) {
        paragraphs.push(...createTranscriptParagraphs(subject.preDiscussionEntries));
    }

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

    // Transcript (no heading)
    paragraphs.push(...createTranscriptParagraphs(subject.transcriptEntries));

    // Decision excerpt (no heading, extra spacing to separate from transcript)
    if (subject.decision?.excerpt) {
        paragraphs.push(new Paragraph({ spacing: { before: 360 } }));
        paragraphs.push(...markdownToDocxParagraphs(subject.decision.excerpt, { fontSize: FONT_SIZE.BODY }));
    }

    // --- Subject footer: attendance, dissenting votes, decision number ---

    // Full vote breakdown
    if (subject.voteResult) {
        const voteCategories: { label: string; members: MinutesMember[] }[] = [
            { label: 'ΥΠΕΡ', members: subject.voteResult.forMembers },
            { label: 'ΚΑΤΑ', members: subject.voteResult.againstMembers },
            { label: 'ΛΕΥΚΑ', members: subject.voteResult.abstainMembers },
            { label: 'ΠΑΡΟΝΤΕΣ', members: subject.voteResult.presentMembers },
            { label: 'ΑΠΟΧΗ', members: subject.voteResult.didNotVoteMembers },
            { label: 'ΑΠΟΝΤΕΣ', members: subject.voteResult.absentMembers },
        ];
        for (const { label, members } of voteCategories) {
            if (members.length === 0) continue;
            const names = members
                .map(m => m.party ? `${m.name} (${m.party}${m.isPartyHead ? ', Επικεφαλής' : ''})` : m.name).join(', ');
            paragraphs.push(new Paragraph({
                spacing: { before: 60, after: 40 },
                children: [
                    new TextRun({ text: `${label} (${members.length}): `, bold: true, size: FONT_SIZE.SMALL }),
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

export async function renderMinutesDocx(data: MinutesData): Promise<Blob> {
    // Fetch images in parallel
    const [cityLogo, ocLogoBuffer] = await Promise.all([
        data.city.logoImage ? fetchImageBuffer(data.city.logoImage) : Promise.resolve(null),
        getOpenCouncilLogo(),
    ]);

    const children: (Paragraph | Table)[] = [];

    // Title page
    children.push(...createTitlePage(data, cityLogo, ocLogoBuffer));

    // Council composition + absent members
    if (data.councilComposition) {
        children.push(...createCouncilCompositionSection(data.councilComposition, data.absentMembers, data.administrativeBody));
    }

    // Table of contents (split into ΕΚΤΟΣ ΗΔ + ΗΔ tables)
    if (data.subjects.length > 0) {
        children.push(...createTOCSections(data.subjects));
    }

    // Preamble: orphaned utterances before the first subject
    if (data.preambleEntries.length > 0) {
        children.push(...createTranscriptParagraphs(data.preambleEntries));
    }

    // All subjects in discussion order (skip withdrawn — they appear in TOC only)
    for (const subject of data.subjects) {
        if (subject.withdrawn) continue;
        children.push(...createSubjectSection(subject));
    }

    // Epilogue: orphaned utterances after the last subject
    if (data.epilogueEntries.length > 0) {
        children.push(...createTranscriptParagraphs(data.epilogueEntries));
    }

    const headers = createHeaders(data);

    const doc = new Document({
        creator: 'OpenCouncil',
        description: 'Πρακτικά Συνεδρίασης',
        title: data.meeting.name,
        subject: 'Πρακτικά',
        evenAndOddHeaderAndFooters: true,
        sections: [{
            properties: {
                titlePage: true,
            },
            headers,
            children,
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    return new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
}
