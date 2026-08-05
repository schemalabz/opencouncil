import {
    Document,
    Paragraph,
    TextRun,
    HeadingLevel,
    ExternalHyperlink,
    Packer,
    AlignmentType,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    TableLayoutType,
} from 'docx';
import { Offer } from '@prisma/client';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';
import { monthsBetween, formatCurrency } from '@/lib/utils';
import { getCorrectnessPricing, PHYSICAL_PRESENCE } from '@/lib/pricing/config';
import { formatTimestamp } from '@/lib/formatters/time';

export interface ReportMeeting {
    id: string;
    cityId: string;
    name: string;
    dateTime: Date;
    durationMs: number | null;
    operatorName: string | null;
}

export interface ReportData {
    city: { id: string; name: string; name_municipality: string };
    offer: Offer;
    meetings: ReportMeeting[];
    startDate: Date;
    endDate: Date;
    contractReference: string;
}

function roundToOneDecimal(n: number): number {
    return Math.round(n * 10) / 10;
}

function getOfferEquipmentRentalPrice(offer: Offer): number {
    return offer.equipmentRentalPrice ?? 0;
}

function getOfferPhysicalPresenceHours(offer: Offer): number {
    return offer.physicalPresenceHours ?? 0;
}

/** Hours of meetings that had an operator present — what physical presence is billed on. */
function calculateOperatorHours(meetings: ReportMeeting[]): number {
    const operatorMs = meetings.reduce(
        (sum, m) => sum + (m.operatorName ? (m.durationMs || 0) : 0),
        0
    );
    return operatorMs / (1000 * 60 * 60);
}

function calculateReportPricing(offer: Offer, startDate: Date, endDate: Date, actualHoursProcessed: number, meetingCount: number, operatorHours: number) {
    const months = monthsBetween(startDate, endDate);

    const platformCost = offer.platformPrice * months;
    const ingestionCost = offer.ingestionPerHourPrice * actualHoursProcessed;

    let correctnessCost = 0;
    if (offer.correctnessGuarantee) {
        const offerVersion = offer.version || 1;
        const correctnessPricing = getCorrectnessPricing(offerVersion);
        correctnessCost = correctnessPricing.pricePerUnit * (
            correctnessPricing.unit === 'hour' ? actualHoursProcessed :
            correctnessPricing.unit === 'meeting' ? meetingCount : 0
        );
    }

    const equipmentRentalCost = getOfferEquipmentRentalPrice(offer) * months;

    // Physical presence: billed on the hours actually covered by an operator,
    // for contracts that include physical presence.
    const physicalPresenceCost = getOfferPhysicalPresenceHours(offer) > 0
        ? operatorHours * PHYSICAL_PRESENCE.pricePerHour
        : 0;

    const subtotal = platformCost + ingestionCost + correctnessCost + equipmentRentalCost + physicalPresenceCost;
    const discount = subtotal * (offer.discountPercentage / 100);
    const total = subtotal - discount;
    const totalWithVat = total * 1.24;

    return { months, platformCost, ingestionCost, correctnessCost, equipmentRentalCost, physicalPresenceCost, subtotal, discount, total, totalWithVat };
}

// Page geometry, in twips. Declared explicitly so the table column widths below
// are known to add up to the text column: A4 minus one-inch margins.
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1440;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;

// Column widths per table, summing to CONTENT_WIDTH. Word autofits tables, but
// Pages and Google Docs lay them out from the declared grid — without one the
// library writes a 100-twip grid and the tables render collapsed there.
const PRICING_COLUMNS = [2600, 4626, 1800];
const MEETINGS_COLUMNS = [1500, 3026, 1500, 1200, 1800];

function headerCell(text: string, width: number): TableCell {
    return new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })] })],
        width: { size: width, type: WidthType.DXA },
    });
}

function cell(text: string, width: number): TableCell {
    return new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })],
        width: { size: width, type: WidthType.DXA },
    });
}

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const TABLE_BORDERS = {
    top: THIN_BORDER,
    bottom: THIN_BORDER,
    left: THIN_BORDER,
    right: THIN_BORDER,
    insideHorizontal: THIN_BORDER,
    insideVertical: THIN_BORDER,
};

function rightAlignedCell(text: string, width: number, bold = false): TableCell {
    return new TableCell({
        children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text, size: 20, bold })],
        })],
        width: { size: width, type: WidthType.DXA },
    });
}

interface PricingBreakdown {
    months: number;
    platformCost: number;
    ingestionCost: number;
    correctnessCost: number;
    equipmentRentalCost: number;
    physicalPresenceCost: number;
    subtotal: number;
    discount: number;
    total: number;
    totalWithVat: number;
}

function createPricingTable(pricing: PricingBreakdown, offer: Offer, actualHours: number, meetingCount: number, operatorHours: number): Table {
    const rows: TableRow[] = [];

    const [labelWidth, detailWidth, amountWidth] = PRICING_COLUMNS;

    const addRow = (label: string, detail: string, amount: number) => {
        rows.push(new TableRow({
            children: [
                cell(label, labelWidth),
                cell(detail, detailWidth),
                rightAlignedCell(formatCurrency(amount), amountWidth),
            ],
        }));
    };

    const hoursLabel = `${roundToOneDecimal(actualHours)} ώρες`;

    addRow('Πλατφόρμα', `${formatCurrency(offer.platformPrice)}/μήνα × ${pricing.months} μήνες`, pricing.platformCost);
    addRow('Ψηφιοποίηση συνεδριάσεων', `${formatCurrency(offer.ingestionPerHourPrice)}/ώρα × ${hoursLabel}`, pricing.ingestionCost);

    if (pricing.correctnessCost > 0) {
        const correctnessPricing = getCorrectnessPricing(offer.version || 1);
        const correctnessDetail = correctnessPricing.unit === 'hour'
            ? `${formatCurrency(correctnessPricing.pricePerUnit)}/ώρα × ${hoursLabel}`
            : `${formatCurrency(correctnessPricing.pricePerUnit)}/συνεδρίαση × ${meetingCount} συνεδριάσεις`;
        addRow('Εγγύηση ορθότητας', correctnessDetail, pricing.correctnessCost);
    }

    if (pricing.equipmentRentalCost > 0) {
        addRow('Ενοικίαση εξοπλισμού', `${formatCurrency(getOfferEquipmentRentalPrice(offer))}/μήνα × ${pricing.months} μήνες`, pricing.equipmentRentalCost);
    }

    if (pricing.physicalPresenceCost > 0) {
        addRow('Φυσική παρουσία', `${formatCurrency(PHYSICAL_PRESENCE.pricePerHour)}/ώρα × ${roundToOneDecimal(operatorHours)} ώρες με χειριστή`, pricing.physicalPresenceCost);
    }

    // Subtotal
    rows.push(new TableRow({
        children: [
            headerCell('Μερικό σύνολο', labelWidth),
            headerCell('', detailWidth),
            rightAlignedCell(formatCurrency(pricing.subtotal), amountWidth, true),
        ],
    }));

    if (pricing.discount > 0) {
        rows.push(new TableRow({
            children: [
                cell('Έκπτωση', labelWidth),
                cell(`${offer.discountPercentage}%`, detailWidth),
                rightAlignedCell(`-${formatCurrency(pricing.discount)}`, amountWidth),
            ],
        }));
    }

    rows.push(new TableRow({
        children: [
            headerCell('Σύνολο (χωρίς ΦΠΑ)', labelWidth),
            headerCell('', detailWidth),
            rightAlignedCell(formatCurrency(pricing.total), amountWidth, true),
        ],
    }));

    rows.push(new TableRow({
        children: [
            headerCell('Σύνολο (με ΦΠΑ 24%)', labelWidth),
            headerCell('', detailWidth),
            rightAlignedCell(formatCurrency(pricing.totalWithVat), amountWidth, true),
        ],
    }));

    return new Table({
        rows: [
            new TableRow({
                children: [
                    headerCell('Κατηγορία', labelWidth),
                    headerCell('Ανάλυση', detailWidth),
                    headerCell('Ποσό', amountWidth),
                ],
            }),
            ...rows,
        ],
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: PRICING_COLUMNS,
        layout: TableLayoutType.FIXED,
        borders: TABLE_BORDERS,
    });
}

function createMeetingsTable(meetings: ReportMeeting[], totalDurationMs: number): Table {
    const [idWidth, nameWidth, dateWidth, durationWidth, operatorWidth] = MEETINGS_COLUMNS;

    const headerRow = new TableRow({
        children: [
            headerCell('ID', idWidth),
            headerCell('Όνομα', nameWidth),
            headerCell('Ημερομηνία', dateWidth),
            headerCell('Διάρκεια', durationWidth),
            headerCell('Χειριστής', operatorWidth),
        ],
    });

    const rows = meetings.map((m) => {
        const durationText = m.durationMs ? formatTimestamp(m.durationMs / 1000) : '—';
        return new TableRow({
            children: [
                cell(m.id, idWidth),
                cell(m.name, nameWidth),
                cell(format(new Date(m.dateTime), 'd MMM yyyy', { locale: el }), dateWidth),
                cell(durationText, durationWidth),
                cell(m.operatorName || '—', operatorWidth),
            ],
        });
    });

    const sumRow = new TableRow({
        children: [
            headerCell('', idWidth),
            headerCell(`Σύνολο (${meetings.length} συνεδριάσεις)`, nameWidth),
            headerCell('', dateWidth),
            headerCell(totalDurationMs > 0 ? formatTimestamp(totalDurationMs / 1000) : '—', durationWidth),
            headerCell('', operatorWidth),
        ],
    });

    return new Table({
        rows: [headerRow, ...rows, sumRow],
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: MEETINGS_COLUMNS,
        layout: TableLayoutType.FIXED,
        borders: TABLE_BORDERS,
    });
}

export async function renderReportDocx(data: ReportData): Promise<Blob> {
    const { city, offer, meetings, startDate, endDate, contractReference } = data;

    const totalDurationMs = meetings.reduce((sum, m) => sum + (m.durationMs || 0), 0);
    const totalHours = totalDurationMs / (1000 * 60 * 60);
    const totalHoursRounded = roundToOneDecimal(totalHours);

    const operatorHours = calculateOperatorHours(meetings);
    const pricing = calculateReportPricing(offer, startDate, endDate, totalHours, meetings.length, operatorHours);

    const reportDate = format(new Date(), 'd MMMM yyyy', { locale: el });
    const periodStart = format(new Date(startDate), 'd MMMM yyyy', { locale: el });
    const periodEnd = format(new Date(endDate), 'd MMMM yyyy', { locale: el });

    const amountFormatted = formatCurrency(pricing.total);
    const amountWithVatFormatted = formatCurrency(pricing.totalWithVat);

    const page1: (Paragraph | Table)[] = [
        new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 1440, after: 400 },
            children: [new TextRun({ text: 'Αναφορά προόδου σύμβασης και αίτημα πληρωμής', size: 32, bold: true })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 480 },
            children: [new TextRun({ text: `Για το Δήμο ${city.name_municipality} – ${reportDate}`, size: 26 })],
        }),
        new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun({ text: `Με βάση τη σύμβαση ${contractReference} για την παροχή υπηρεσιών ψηφιοποίησης συνεδριάσεων δημοτικού συμβουλίου, αιτούμαστε τη πληρωμή ${amountFormatted} πλέον ΦΠΑ για την περίοδο ${periodStart} – ${periodEnd}, ήτοι σύνολο συμπεριλαμβανομένου ΦΠΑ ${amountWithVatFormatted}.`, size: 24 })],
        }),
        new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 360, after: 240 },
            children: [new TextRun({ text: 'Ανάλυση κόστους', size: 28, bold: true })],
        }),
        createPricingTable(pricing, offer, totalHours, meetings.length, operatorHours),
        new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 480, after: 240 },
            children: [new TextRun({ text: 'Αναφορά προόδου', size: 28, bold: true })],
        }),
        new Paragraph({
            spacing: { after: 240 },
            children: [new TextRun({ text: `Ψηφιοποιήσαμε ${meetings.length} συνεδριάσεις του Δήμου ${city.name_municipality} συνολικής αθροιστικής διάρκειας ${totalHoursRounded} ωρών.`, size: 24 })],
        }),
        new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: 'Οι υπηρεσίες που παρείχαμε περιλαμβάνουν:', size: 24 })],
        }),
        ...[
            'Μετατροπή βίντεο/ήχου σε κατάλληλη μορφή για επεξεργασία',
            'Αυτόματη απομαγνητοφώνηση με αναγνώριση ομιλητών',
            'Διαθεσιμότητα μέσω της πλατφόρμας OpenCouncil',
            'Αυτόματες περιλήψεις ανά θέμα ημερήσιας διάταξης',
            'Αναζήτηση πλήρους κειμένου σε όλες τις συνεδριάσεις',
            'Σελίδες ομιλητών με στατιστικά συμμετοχής',
        ].map(text => new Paragraph({
            spacing: { after: 60 },
            bullet: { level: 0 },
            children: [new TextRun({ text, size: 24 })],
        })),
        new Paragraph({
            spacing: { before: 360, after: 240 },
            children: [
                new TextRun({ text: 'Η αναφορά αυτή βασίζεται στην προσφορά: ', size: 24 }),
                new ExternalHyperlink({
                    children: [new TextRun({ text: `opencouncil.gr/offer-letter/${offer.id}`, style: 'Hyperlink', size: 24 })],
                    link: `https://opencouncil.gr/offer-letter/${offer.id}`,
                }),
            ],
        }),
        new Paragraph({
            spacing: { before: 480 },
            children: [new TextRun({ text: 'Με εκτίμηση, εκ μέρους της OpenCouncil,', size: 24 })],
        }),
        new Paragraph({
            children: [new TextRun({ text: 'Χρήστος Πόριος', size: 24, bold: true })],
        }),
    ];

    const page2: (Paragraph | Table)[] = [
        new Paragraph({ pageBreakBefore: true }),
        new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { after: 360 },
            children: [new TextRun({ text: 'Πίνακας Συνεδριάσεων που έχουν καλυφθεί', size: 28, bold: true })],
        }),
        createMeetingsTable(meetings, totalDurationMs),
    ];

    const doc = new Document({
        creator: 'OpenCouncil',
        description: `Report for ${city.name_municipality}`,
        title: `Αναφορά προόδου – ${city.name_municipality}`,
        sections: [{
            properties: {
                page: {
                    size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
                    margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
                },
            },
            children: [...page1, ...page2],
        }],
    });

    return Packer.toBlob(doc);
}
