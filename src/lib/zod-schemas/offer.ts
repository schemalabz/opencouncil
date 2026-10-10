import * as z from 'zod';
import { vmsg } from './messages';

/**
 * ΑΔΑΜ (ΚΗΜΔΗΣ public-procurement registry) identifier format:
 *   - Exactly 2 digits (year)
 *   - At least 3 uppercase letters, Latin or Greek (document type, e.g.
 *     PROC, SYMV, AWRD)
 *   - One or more digits (sequence)
 * Example: "24PROC015123456"
 */
export const ADAM_REGEX = /^\d{2}[A-ZΑ-Ω]{3,}\d+$/;

export const ADAM_FORMAT_MESSAGE =
    'ΑΔΑΜ must match format: 2 digits, 3+ letters, then digits (e.g. 24PROC015123456)';

/**
 * Form-friendly schema: optional, accepts empty string as "not set".
 * Callers are responsible for converting "" → null before persisting.
 */
export const adamSchema = z
    .string()
    .optional()
    .refine(
        (val) => !val || ADAM_REGEX.test(val),
        { error: ADAM_FORMAT_MESSAGE }
    );

/**
 * Strict schema for backend validation: must be a non-empty matching string
 * if provided.
 */
export function validateAdam(value: unknown): asserts value is string | null | undefined {
    if (value === null || value === undefined || value === '') return;
    if (typeof value !== 'string' || !ADAM_REGEX.test(value)) {
        throw new Error(ADAM_FORMAT_MESSAGE);
    }
}

/** The offer form (React Hook Form). */
export const offerFormSchema = z.object({
    recipientName: z.string().min(2, {
        error: vmsg('recipientNameMin2'),
    }),
    platformPrice: z.number().min(0, {
        error: vmsg('platformPriceNonNegative'),
    }),
    ingestionPerHourPrice: z.number().min(0, {
        error: vmsg('ingestionPriceNonNegative'),
    }),
    hoursToIngest: z.number().int().min(1, {
        error: vmsg('hoursToIngestMin1'),
    }),
    discountPercentage: z.number().min(0).max(100, {
        error: vmsg('discountPercentageRange'),
    }),
    type: z.string().default("pilot"),
    startDate: z.date({
        error: vmsg('startDateRequired'),
    }),
    endDate: z.date({
        error: vmsg('endDateRequired'),
    }),
    respondToName: z.string().min(2, {
        error: vmsg('respondToNameMin2'),
    }),
    respondToEmail: z.email({
        error: vmsg('invalidEmailAddress'),
    }),
    respondToPhone: z.string().min(10, {
        error: vmsg('invalidPhoneNumber'),
    }),
    cityId: z.string().optional(),
    correctnessGuarantee: z.boolean().default(false),
    meetingsToIngest: z.number().int().min(1).optional(),
    hoursToGuarantee: z.number().int().min(1).optional(),
    includeEquipmentRental: z.boolean().default(false),
    equipmentRentalPrice: z.number().min(0).optional(),
    equipmentRentalName: z.string().optional(),
    equipmentRentalDescription: z.string().optional(),
    includePhysicalPresence: z.boolean().default(false),
    physicalPresenceHours: z.number().int().min(0).optional(),
    agreed: z.boolean().default(false),
    adam: adamSchema,
})
