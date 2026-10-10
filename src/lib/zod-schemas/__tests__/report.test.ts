/** @jest-environment node */
import { reportRequestSchema } from '@/lib/zod-schemas/report';

const body = { cityId: 'chania', contractReference: 'C-1', startDate: '2026-10-01', endDate: '2026-10-09' };
const messages = (input: object) => reportRequestSchema.safeParse(input).error?.issues.map(issue => issue.message);

describe('reportRequestSchema', () => {
    it('takes a period of two calendar days in order', () => {
        expect(reportRequestSchema.safeParse(body).success).toBe(true);
    });

    it('refuses an end date that is not after the start date', () => {
        expect(messages({ ...body, endDate: '2026-09-30' })).toEqual(['endDate must be after startDate']);
        expect(messages({ ...body, endDate: body.startDate })).toEqual(['endDate must be after startDate']);
    });

    it.each(['09/10/2026', '2026-10-09T00:00:00Z', '2026-02-31'])(
        'reports only the malformed day for %s, not the order rule',
        endDate => {
            expect(messages({ ...body, endDate })).toEqual(['Invalid ISO date']);
        },
    );
});
