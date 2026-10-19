import * as z from 'zod';
import { vmsg } from './messages';

// The fields that the progress report form and POST /api/admin/reports share.
const reportFields = {
    cityId: z.string().min(1, vmsg('cityRequired')),
    contractReference: z.string().min(1, vmsg('contractReferenceRequired')).max(200),
};

/** The progress report form (React Hook Form): the period is a date range. */
export const reportFormSchema = z.object({
    ...reportFields,
    dateRange: z.object({
        from: z.date(),
        to: z.date(),
    }, { error: vmsg('periodRequired') }),
});

/**
 * JSON body of POST /api/admin/reports. The form sends the period as two
 * calendar days (YYYY-MM-DD), so that the zone of the browser does not move them.
 */
export const reportRequestSchema = z.object({
    ...reportFields,
    startDate: z.iso.date(),
    endDate: z.iso.date(),
}).refine(({ startDate, endDate }) => startDate < endDate, {
    path: ['endDate'],
    error: 'endDate must be after startDate',
    // Compare only two valid days, so a malformed date reports one issue.
    when: payload => payload.issues.length === 0,
});
