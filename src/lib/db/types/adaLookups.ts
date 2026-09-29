/**
 * How long after its task ends a found lookup may still lack its candidate.
 *
 * The task is marked succeeded before its result handler writes the
 * candidates, so a read in that gap sees a found ΑΔΑ with no row behind it.
 * Inside this window such a read counts as still running.
 */
export const ADA_LOOKUP_SETTLE_MS = 2 * 60 * 1000;

/** What the page can say about one typed ΑΔΑ after its poll. */
export type AdaLookupOutcome =
    | { state: 'running' }
    | { state: 'failed' } // the task failed, or an older tasks version sent no lookups
    | { state: 'notFound' }
    | { state: 'error' }
    /** Diavgeia has the document, but its reading says it is not a decision of a collective body. */
    | { state: 'notADecision' }
    | {
        state: 'found';
        /** The unresolved candidate to link; null when a decision already holds the ΑΔΑ. */
        candidateId: string | null;
        /** Set only when the document belongs to another organization than the city's. */
        organizationLabel: string | null;
        /** The subject whose decision already holds the ΑΔΑ, named well enough
         * to say so when it belongs to another meeting. */
        linkedTo: {
            subjectId: string;
            meetingId: string;
            meetingName: string;
            subjectName: string;
            agendaItemIndex: number | null;
        } | null;
    };
