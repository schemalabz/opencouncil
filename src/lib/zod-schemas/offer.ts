import { z } from 'zod';

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
        { message: ADAM_FORMAT_MESSAGE }
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
