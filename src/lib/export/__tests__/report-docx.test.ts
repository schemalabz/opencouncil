import { Offer } from '@prisma/client';
import JSZip from 'jszip';
import { renderReportDocx, ReportMeeting } from '../report-docx';

const offer = {
    id: 'offer1',
    cityId: 'chalandri',
    startDate: new Date('2025-08-31'),
    endDate: new Date('2026-08-30'),
    platformPrice: 1200,
    ingestionPerHourPrice: 50,
    discountPercentage: 10,
    correctnessGuarantee: true,
    equipmentRentalPrice: 200,
    physicalPresenceHours: 150,
    version: 3,
} as unknown as Offer;

const meetings: ReportMeeting[] = [
    { id: 'sep10_2025', cityId: 'chalandri', name: 'Τακτική συνεδρίαση', dateTime: new Date('2025-09-10'), durationMs: 2 * 3600_000, operatorName: 'Χειριστής Ένας' },
    { id: 'oct10_2025', cityId: 'chalandri', name: 'Έκτακτη συνεδρίαση', dateTime: new Date('2025-10-10'), durationMs: 3 * 3600_000, operatorName: null },
];

async function renderDocumentXml(): Promise<string> {
    const blob = await renderReportDocx({
        city: { id: 'chalandri', name: 'Χαλάνδρι', name_municipality: 'Χαλανδρίου' },
        offer,
        meetings,
        startDate: new Date('2025-08-31'),
        endDate: new Date('2026-02-27'),
        contractReference: '23ΑΩΡΔ123456',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    return zip.file('word/document.xml')!.async('string');
}

describe('renderReportDocx', () => {
    // Word autofits tables and ignores the declared grid; Pages and Google Docs
    // lay them out from it, so a grid that doesn't span the text column renders
    // as a collapsed, unreadable table there.
    it('declares table grids that span the text column', async () => {
        const xml = await renderDocumentXml();

        const grids = [...xml.matchAll(/<w:tblGrid>(.*?)<\/w:tblGrid>/g)].map(match =>
            [...match[1].matchAll(/w:w="(\d+)"/g)].map(col => Number(col[1]))
        );

        expect(grids).toHaveLength(2);
        for (const grid of grids) {
            expect(grid.reduce((sum, width) => sum + width, 0)).toBe(9026);
        }
        // A4 (11906) minus the one-inch margins the section declares.
        expect(xml).toContain('<w:pgSz w:w="11906"');
        expect(xml).toContain('w:left="1440"');
    });

    it('bills physical presence on the hours that had an operator', async () => {
        const xml = await renderDocumentXml();
        // formatCurrency separates the amount from € with a non-breaking space.
        const text = xml.replace(/<[^>]+>/g, '').replace(/ /g, ' ');

        // Only the first meeting had an operator: 2h × €25, not a share of the
        // 150 contracted hours.
        expect(text).toContain('Φυσική παρουσία25,00 €/ώρα × 2 ώρες με χειριστή50,00 €');
    });
});
