import { Offer } from '@prisma/client';
import { renderReportDocx, ReportMeeting } from '../report-docx';
import { docxPart } from '../../../../tests/helpers/docx';

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

async function renderDocumentXml(
    reportOffer: Offer = offer,
    reportMeetings: ReportMeeting[] = meetings
): Promise<string> {
    const blob = await renderReportDocx({
        city: { id: 'chalandri', name: 'Χαλάνδρι', name_municipality: 'Χαλανδρίου' },
        offer: reportOffer,
        meetings: reportMeetings,
        startDate: new Date('2025-08-31'),
        endDate: new Date('2026-02-27'),
        contractReference: '23ΑΩΡΔ123456',
    });
    return docxPart(blob);
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
        expect(text).not.toContain('Χρέωση φυσικής παρουσίας');
    });

    describe('with the one-hour minimum charge of physical presence', () => {
        const minimumOffer = { ...offer, physicalPresenceMinimumCharge: true } as Offer;
        const shortMeetings: ReportMeeting[] = [
            ...meetings,
            { id: 'nov10_2025', cityId: 'chalandri', name: 'Ειδική συνεδρίαση', dateTime: new Date('2025-11-10'), durationMs: 20 * 60_000, operatorName: 'Χειριστής Ένας' },
            { id: 'dec10_2025', cityId: 'chalandri', name: 'Έκτακτη συνεδρίαση', dateTime: new Date('2025-12-10'), durationMs: 30 * 60_000, operatorName: null },
        ];

        async function renderText(reportOffer: Offer): Promise<string> {
            const xml = await renderDocumentXml(reportOffer, shortMeetings);
            return xml.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ');
        }

        it('charges a short meeting with an operator as one hour', async () => {
            const text = await renderText(minimumOffer);

            // 2h + the 20-minute meeting charged as 1h. The meetings without an
            // operator add nothing.
            expect(text).toContain('Φυσική παρουσία25,00 €/ώρα × 3 ώρες με χειριστή (ελάχιστη χρέωση μίας ώρας ανά συνεδρίαση)75,00 €');
            // Digitization stays on the actual duration: 2h + 3h + 20min + 30min.
            expect(text).toContain('Ψηφιοποίηση συνεδριάσεων50,00 €/ώρα × 5.8 ώρες');
        });

        it('shows the charged duration next to the actual duration', async () => {
            const text = await renderText(minimumOffer);

            expect(text).toContain('ΔιάρκειαΧρέωση φυσικής παρουσίαςΧειριστής');
            expect(text).toContain('00:20:0001:00:00Χειριστής Ένας');
            expect(text).toContain('02:00:0002:00:00Χειριστής Ένας');
            // No operator: physical presence is not charged.
            expect(text).toContain('00:30:00——');
            expect(text).toContain('05:50:0003:00:00');
        });

        it('keeps a six-column grid that spans the text column', async () => {
            const xml = await renderDocumentXml(minimumOffer, shortMeetings);
            const grids = [...xml.matchAll(/<w:tblGrid>(.*?)<\/w:tblGrid>/g)].map(match =>
                [...match[1].matchAll(/w:w="(\d+)"/g)].map(col => Number(col[1]))
            );

            expect(grids[1]).toHaveLength(6);
            expect(grids[1].reduce((sum, width) => sum + width, 0)).toBe(9026);
        });

        it('has no effect on an offer without physical presence', async () => {
            const text = await renderText({ ...minimumOffer, physicalPresenceHours: null } as Offer);

            expect(text).not.toContain('Φυσική παρουσία');
        });

        it('charges the actual duration when the offer does not have the minimum', async () => {
            const text = await renderText(offer);

            expect(text).toContain('× 2.3 ώρες με χειριστή58,33 €');
        });
    });
});
