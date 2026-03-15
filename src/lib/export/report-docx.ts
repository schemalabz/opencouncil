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
} from 'docx';
import { Offer } from '@prisma/client';
import { format } from 'date-fns';
import { el } from 'date-fns/locale';
import { monthsBetween, formatCurrency } from '@/lib/utils';
import { getCorrectnessPricing, PHYSICAL_PRESENCE } from '@/lib/pricing/config';

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

function formatDurationSeconds(ms: number): string {
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function calculateReportPricing(offer: Offer, startDate: Date, endDate: Date, actualHoursProcessed: number) {
    const months = monthsBetween(startDate, endDate);

    const platformCost = offer.platformPrice * months;
    const ingestionCost = offer.ingestionPerHourPrice * actualHoursProcessed;

    let correctnessCost = 0;
    if (offer.correctnessGuarantee) {
        const offerVersion = offer.version || 1;
        const correctnessPricing = getCorrectnessPricing(offerVersion);
        if (correctnessPricing.unit === 'hour') {
            correctnessCost = correctnessPricing.pricePerUnit * actualHoursProcessed;
        }
    }

    const equipmentRentalCost = ((offer as Record<string, unknown>).equipmentRentalPrice as number || 0) * months;

    // Physical presence: prorate by period/contract ratio
    const contractMonths = monthsBetween(offer.startDate, offer.endDate);
    const periodRatio = contractMonths > 0 ? months / contractMonths : 1;
    const physicalPresenceCost = ((offer as Record<string, unknown>).physicalPresenceHours as number || 0) * PHYSICAL_PRESENCE.pricePerHour * periodRatio;

    const subtotal = platformCost + ingestionCost + correctnessCost + equipmentRentalCost + physicalPresenceCost;
    const discount = subtotal * (offer.discountPercentage / 100);
    const total = subtotal - discount;
    const totalWithVat = total * 1.24;

    return { months, platformCost, ingestionCost, correctnessCost, equipmentRentalCost, physicalPresenceCost, subtotal, discount, total, totalWithVat };
}

function headerCell(text: string): TableCell {
    return new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20 })] })],
        width: { size: 100, type: WidthType.AUTO },
    });
}

function cell(text: string): TableCell {
    return new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, size: 20 })] })],
        width: { size: 100, type: WidthType.AUTO },
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

function createMeetingsTable(meetings: ReportMeeting[]): Table {
    const headerRow = new TableRow({
        children: [
            headerCell('A/A'),
            headerCell('Όνομα'),
            headerCell('Ημερομηνία'),
            headerCell('Διάρκεια'),
            headerCell('Χειριστής'),
        ],
    });

    const rows = meetings.map((m, i) => {
        const durationText = m.durationMs ? formatDurationSeconds(m.durationMs) : '—';
        return new TableRow({
            children: [
                cell(String(i + 1)),
                cell(m.name),
                cell(format(new Date(m.dateTime), 'd MMM yyyy', { locale: el })),
                cell(durationText),
                cell(m.operatorName || '—'),
            ],
        });
    });

    return new Table({
        rows: [headerRow, ...rows],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TABLE_BORDERS,
    });
}

export async function renderReportDocx(data: ReportData): Promise<Blob> {
    const { city, offer, meetings, startDate, endDate, contractReference } = data;

    const totalDurationMs = meetings.reduce((sum, m) => sum + (m.durationMs || 0), 0);
    const totalHours = totalDurationMs / (1000 * 60 * 60);
    const totalHoursRounded = Math.round(totalHours * 10) / 10;

    const pricing = calculateReportPricing(offer, startDate, endDate, totalHours);

    const reportDate = format(new Date(), 'd MMMM yyyy', { locale: el });
    const periodStart = format(new Date(startDate), 'd MMMM yyyy', { locale: el });
    const periodEnd = format(new Date(endDate), 'd MMMM yyyy', { locale: el });

    const amountFormatted = formatCurrency(pricing.total);
    const amountWithVatFormatted = formatCurrency(pricing.totalWithVat);

    const page1: Paragraph[] = [
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
        createMeetingsTable(meetings),
    ];

    const doc = new Document({
        creator: 'OpenCouncil',
        description: `Report for ${city.name_municipality}`,
        title: `Αναφορά προόδου – ${city.name_municipality}`,
        sections: [{
            properties: {},
            children: [...page1, ...page2],
        }],
    });

    return Packer.toBlob(doc);
}
