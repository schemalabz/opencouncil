import type * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { formSchema as reportFormSchema } from '@/components/admin/reports/ReportForm';
import { meetingFormSchema as addMeetingFormSchema } from '@/lib/zod-schemas/meeting';
import { formSchema as offerFormSchema } from '@/components/admin/offers/offer-form';
import { vmsg } from '@/lib/zod-schemas/messages';

jest.mock('@/lib/db/offers', () => ({}));
jest.mock('@/lib/db/cities', () => ({}));
jest.mock('next-auth/react', () => ({}));

const rhfOptions = { fields: {}, shouldUseNativeValidation: false } as const;

// The field errors of an empty form: react-hook-form leaves a field without a default value undefined.
async function emptyFormErrors<S extends z.ZodObject>(schema: S) {
    const result = await zodResolver(schema)({} as z.input<S>, undefined, rhfOptions);
    return result.errors as Record<string, { message?: string } | undefined>;
}

// A form shows the custom message of a required field that the user left empty.
// The resolver must return field errors with these messages, and must not throw.
describe('required-field messages of the forms', () => {
    // The resolver returns the English text of the key. FormMessage shows it in
    // the language of the reader (localizedValidationMessages.test.tsx).
    it('ReportForm: a missing period shows the period message', async () => {
        const errors = await emptyFormErrors(reportFormSchema);
        expect(errors.dateRange?.message).toBe(vmsg('periodRequired'));
    });

    it('AddMeetingForm: a missing date and time show the English messages', async () => {
        const errors = await emptyFormErrors(addMeetingFormSchema);
        expect(errors.date?.message).toBe('Meeting date is required.');
        expect(errors.time?.message).toBe('Meeting time is required.');
    });

    it('OfferForm: a missing start and end date show the English messages', async () => {
        const errors = await emptyFormErrors(offerFormSchema);
        expect(errors.startDate?.message).toBe('Start date is required.');
        expect(errors.endDate?.message).toBe('End date is required.');
    });
});
