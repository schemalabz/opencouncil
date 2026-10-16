// One entry per document (#874): the renderer and the email that carries it.
// A new DocumentKind fails to compile here, and in DOCUMENT_RULES
// (readiness.ts), until it has both. Like taskHandlers in src/lib/tasks/registry.ts.
import "server-only";
import type { DocumentKind } from '@prisma/client';
import type { DocumentMeeting, DocumentPayload } from './send';
import type { Readiness } from './readiness';
import { transcriptPayload } from './transcript';
import { minutesPayload } from './minutes';

export interface DocumentDefinition {
    /** The DOCX and the email of the document for a meeting, given why it goes out now. */
    payload: (meeting: DocumentMeeting, readiness: Readiness) => Promise<DocumentPayload>;
}

export const documents: Record<DocumentKind, DocumentDefinition> = {
    transcript: { payload: transcriptPayload },
    minutes: { payload: minutesPayload },
};
