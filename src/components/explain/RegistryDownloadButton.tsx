"use client";

import { FileDown, Loader2 } from "lucide-react";
import { usePdfDownload } from "@/hooks/use-pdf-download";
import { REGISTRY_VERSION } from "@/lib/explain/registry";

/**
 * Downloads the registry declaration as a PDF, generated in the browser from
 * the same data the page shows. @react-pdf/renderer loads on click, so it
 * stays out of the page bundle.
 */
export function RegistryDownloadButton() {
    const { busy, download } = usePdfDownload();

    function handleDownload() {
        download(async () => {
            const { RegistryDeclarationPdf } = await import("./registry-declaration-pdf");
            return <RegistryDeclarationPdf baseUrl={window.location.origin} />;
        }, `opencouncil-mitroo-TN-${REGISTRY_VERSION}.pdf`);
    }

    return (
        <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange/90 disabled:opacity-60"
        >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileDown className="h-4 w-4" aria-hidden="true" />}
            Κατεβάστε τη δήλωση σε PDF
        </button>
    );
}
