import * as z from 'zod';
import { webUrl } from './primitives';

/**
 * JSON body of PUT /decisions: link a decision to a subject of the meeting.
 * The messages are plain English: the manual decision form shows its own text.
 */
export const decisionUpsertSchema = z.object({
    subjectId: z.string().min(1),
    pdfUrl: webUrl({ error: 'pdfUrl must be http(s)' }),
    decisionNumber: z.string().optional(),
    protocolNumber: z.string().optional(),
    ada: z.string().optional(),
    title: z.string().optional(),
    publishDate: z.iso.datetime().optional(),
});

/** JSON body of POST /decisions: one action on the decisions of the meeting. */
export const decisionActionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('clearExtractedData') }),
    z.object({ action: z.literal('resetExtraction'), subjectId: z.string().min(1) }),
    z.object({ action: z.literal('assignCandidate'), candidateId: z.string().min(1), subjectId: z.string().min(1) }),
    z.object({ action: z.literal('dismissCandidate'), candidateId: z.string().min(1) }),
    z.object({ action: z.literal('undismissCandidate'), candidateId: z.string().min(1) }),
    z.object({ action: z.literal('rederive') }),
]);

// The form of a decision that is not on Diavgeia. The PDF link follows the
// rule of the PUT route. The form trims every field before it checks it.
export const manualDecisionFormSchema = z.object({
    pdfUrl: z.string().trim().pipe(decisionUpsertSchema.shape.pdfUrl),
    decisionNumber: z.string().trim().min(1),
    title: z.string().trim(),
    protocolNumber: z.string().trim(),
});
