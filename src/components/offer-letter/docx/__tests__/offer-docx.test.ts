import { Packer } from 'docx';
import type { Document } from 'docx';
import JSZip from 'jszip';
import type { Offer } from '@prisma/client';
import { buildTechnicalDescriptionDoc } from '../TechnicalDescriptionDocx';
import { buildFinancialOfferDoc } from '../FinancialOfferDocx';
import { buildTechnicalOfferDoc } from '../TechnicalOfferDocx';
import { CONTENT_WIDTH, FONT, PAGE_MARGIN, PAGE_WIDTH } from '../shared';

const offer = {
    id: 'offer1',
    cityId: 'chania',
    type: 'pilot',
    version: 3,
    startDate: new Date('2026-09-01'),
    endDate: new Date('2027-08-31'),
    recipientName: 'Δήμο Χανίων',
    platformPrice: 1200,
    ingestionPerHourPrice: 50,
    hoursToIngest: 100,
    hoursToGuarantee: 50,
    discountPercentage: 10,
    correctnessGuarantee: true,
    equipmentRentalPrice: 200,
    equipmentRentalName: 'Εξοπλισμός',
    equipmentRentalDescription: 'Κάμερες και μικρόφωνα',
    physicalPresenceHours: 150,
} as unknown as Offer;

const params = {
    projectName: 'ΜΑΓΝΗΤΟΣΚΟΠΗΣΗ ΚΑΙ ΚΑΤΑΧΩΡΗΣΗ',
    studyNumber: '93/2025',
    protocolNumber: '22201',
    cpv: '72400000-4 (Υπηρεσίες διαδικτύου)',
};

async function parts(doc: Document): Promise<{ document: string; styles: string }> {
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc));
    return {
        document: await zip.file('word/document.xml')!.async('string'),
        styles: await zip.file('word/styles.xml')!.async('string'),
    };
}

const documents: [string, () => Document | Promise<Document>][] = [
    ['Τεχνική Περιγραφή', () => buildTechnicalDescriptionDoc(offer)],
    ['Οικονομική Προσφορά', () => buildFinancialOfferDoc(offer, params)],
    ['Τεχνική Προσφορά', () => buildTechnicalOfferDoc(offer, params)],
];

describe.each(documents)('%s', (_name, build) => {
    // Word autofits tables and picks a theme font for anything the document
    // leaves unset; Pages and Google Docs lay out from the declared grid and
    // fall back to their own defaults. Anything left implicit renders
    // differently there, so the documents have to spell it out.
    it('pins the A4 page geometry the column widths are derived from', async () => {
        const { document } = await parts(await build());

        expect(document).toContain(`<w:pgSz w:w="${PAGE_WIDTH}"`);
        expect(document).toContain(`w:left="${PAGE_MARGIN}"`);
    });

    it('names the font on the document defaults and on every heading', async () => {
        const { styles } = await parts(await build());

        const fontDeclarations = [...styles.matchAll(/<w:rFonts [^>]*w:ascii="([^"]+)"/g)];
        expect(fontDeclarations.length).toBeGreaterThanOrEqual(4); // defaults + 3 headings
        for (const declaration of fontDeclarations) {
            expect(declaration[1]).toBe(FONT);
        }
    });

    // Word substitutes its own built-ins for styles a document references but
    // never defines. Pages improvises instead: unstyled paragraphs took on the
    // formatting of whatever preceded them and their alignment and spacing were
    // dropped, so every style a paragraph or another style points at has to
    // exist in styles.xml.
    it('defines every style it references', async () => {
        const { document, styles } = await parts(await build());

        const defined = new Set([...styles.matchAll(/w:styleId="([^"]+)"/g)].map(m => m[1]));
        const referenced = [
            ...styles.matchAll(/<w:(?:basedOn|next|link) w:val="([^"]+)"\/>/g),
            ...document.matchAll(/<w:pStyle w:val="([^"]+)"\/>/g),
        ].map(m => m[1]);

        expect([...new Set(referenced)].filter(id => !defined.has(id))).toEqual([]);
        expect(defined.has('Normal')).toBe(true);
    });

    it('gives every paragraph an explicit style', async () => {
        const { document } = await parts(await build());

        const paragraphs = [...document.matchAll(/<w:p>(?:<w:pPr>(.*?)<\/w:pPr>)?/g)];
        expect(paragraphs.length).toBeGreaterThan(0);
        expect(paragraphs.filter(p => !p[1]?.includes('w:pStyle'))).toEqual([]);
    });

    it('turns off the italics the apps’ built-in heading styles apply', async () => {
        const { styles } = await parts(await build());

        for (const level of [1, 2, 3]) {
            const style = styles.match(
                new RegExp(`<w:style [^>]*w:styleId="Heading${level}".*?</w:style>`, 's')
            );
            expect(style).not.toBeNull();
            expect(style![0]).toContain('<w:i w:val="false"/>');
        }
    });
});

describe('budget table', () => {
    it('declares a fixed grid spanning the text column', async () => {
        const { document } = await parts(buildTechnicalDescriptionDoc(offer));

        const grid = [...document.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(col =>
            Number(col[1])
        );
        expect(grid).toHaveLength(7);
        expect(grid.reduce((sum, width) => sum + width, 0)).toBe(CONTENT_WIDTH);
        expect(document).toContain('<w:tblLayout w:type="fixed"/>');
    });
});
