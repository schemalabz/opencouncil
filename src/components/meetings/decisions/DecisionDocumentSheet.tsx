"use client";

import { ConfirmSheet } from './ConfirmSheet';

interface DecisionDocumentSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string | null;
    decisionNumber: string | null;
    pdfUrl: string;
    ada: string | null;
}

/**
 * The decision document, read in place: the decisions page's sheet in its
 * view mode, with nothing to confirm. The subject page opens it instead of
 * sending the reader to Diavgeia; the way there stays in the sheet's header.
 */
export function DecisionDocumentSheet({ open, onOpenChange, title, decisionNumber, pdfUrl, ada }: DecisionDocumentSheetProps) {
    return (
        <ConfirmSheet
            open={open}
            onOpenChange={onOpenChange}
            action="view"
            destructive={false}
            decisionTitle={title}
            decisionNumber={decisionNumber}
            subjectName={null}
            pdfUrl={pdfUrl}
            ada={ada}
            busy={false}
            onConfirm={() => undefined}
        />
    );
}
