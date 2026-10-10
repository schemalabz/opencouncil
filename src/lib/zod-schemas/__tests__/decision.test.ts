import { decisionUpsertSchema, manualDecisionFormSchema } from '@/lib/zod-schemas/decision';

const entry = { pdfUrl: 'https://files.example/a.pdf', decisionNumber: '12/2025', title: '', protocolNumber: '' };
const pdfUrlAccepted = (pdfUrl: string) => manualDecisionFormSchema.safeParse({ ...entry, pdfUrl }).success;

// The manual form checked the link with its own regex, /^https?:\/\/\S+$/.
// It now uses the rule of the PUT route, so a link the form passes is a
// link the route stores.
describe('manualDecisionFormSchema', () => {
    it.each([
        'https://files.example/a.pdf',
        'HTTPS://FILES.EXAMPLE/A.PDF',
        'https://diavgeia.gov.gr/doc/ΨΚΖ7ΩΗ5-ΑΡΚ',
        'https://δήμος.ελ/α.pdf',
    ])('accepts %s, as the form and the route both did', (pdfUrl) => {
        expect(pdfUrlAccepted(pdfUrl)).toBe(true);
        expect(decisionUpsertSchema.shape.pdfUrl.safeParse(pdfUrl).success).toBe(true);
    });

    it.each([
        'javascript:alert(1)',
        'ftp://files.example/a.pdf',
        'https://',
        'https://files example/a.pdf',
        'files.example/a.pdf',
    ])('refuses %s, as the form and the route both did', (pdfUrl) => {
        expect(pdfUrlAccepted(pdfUrl)).toBe(false);
        expect(decisionUpsertSchema.shape.pdfUrl.safeParse(pdfUrl).success).toBe(false);
    });

    // The regex took these, and then the route answered 400.
    it.each(['http://[', 'https://a.gr:99999/x.pdf'])('refuses %s, which the old regex took', (pdfUrl) => {
        expect(/^https?:\/\/\S+$/.test(pdfUrl)).toBe(true);
        expect(pdfUrlAccepted(pdfUrl)).toBe(false);
    });

    it('trims every field before it checks it', () => {
        expect(manualDecisionFormSchema.parse({
            pdfUrl: '  https://files.example/a.pdf ',
            decisionNumber: ' 12/2025 ',
            title: ' Τίτλος ',
            protocolNumber: ' ',
        })).toEqual({ pdfUrl: 'https://files.example/a.pdf', decisionNumber: '12/2025', title: 'Τίτλος', protocolNumber: '' });
    });

    it('requires a decision number', () => {
        expect(manualDecisionFormSchema.safeParse({ ...entry, decisionNumber: '  ' }).success).toBe(false);
    });
});
