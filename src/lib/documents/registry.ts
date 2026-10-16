// One entry per document (#874): the renderer and the email that carries it.
// A new DocumentKind fails to compile here, and in DOCUMENT_RULES
// (readiness.ts), until it has both. Like taskHandlers in src/lib/tasks/registry.ts.
import "server-only";
import type { DocumentKind } from '@prisma/client';
import type { DocumentMeeting } from '@/lib/db/types';
import type { DocumentPayload } from './send';
import type { SendableReadiness } from './readiness';
import { transcriptPayload } from './transcript';
import { minutesPayload } from './minutes';

/** The DOCX and the email of a document for a meeting, given what the rule said right before the send. */
export type DocumentPayloadBuilder = (meeting: DocumentMeeting, readiness: SendableReadiness) => Promise<DocumentPayload>;

export const documents: Record<DocumentKind, { payload: DocumentPayloadBuilder }> = {
    transcript: { payload: transcriptPayload },
    minutes: { payload: minutesPayload },
};
