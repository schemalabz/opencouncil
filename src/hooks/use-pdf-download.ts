"use client";
import { useState } from "react";
import type { ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { downloadBlob } from "@/lib/utils/download";

/**
 * Shared busy-state + generation flow for client-side PDF download buttons
 * (offer letter, brochure). `load` builds the document element — typically
 * after lazy-importing its module, so @react-pdf/renderer (~500KB gz) stays
 * out of the initial page bundle.
 */
export function usePdfDownload() {
    const [busy, setBusy] = useState(false);

    async function download(
        load: () => Promise<ReactElement<DocumentProps>>,
        filename: string
    ): Promise<void> {
        setBusy(true);
        try {
            const [{ pdf }, doc] = await Promise.all([import("@react-pdf/renderer"), load()]);
            const blob = await pdf(doc).toBlob();
            downloadBlob(blob, filename);
        } catch (err) {
            console.error("Failed to generate PDF:", err);
            alert("Δεν ήταν δυνατή η δημιουργία του PDF. Δοκιμάστε ξανά.");
        } finally {
            setBusy(false);
        }
    }

    return { busy, download };
}
