"use client";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { usePdfDownload } from "@/hooks/use-pdf-download";
import type { Offer } from "@prisma/client";

/** Generates and downloads a PDF for the given offer. */
export function DownloadPdfButton({
    offer,
    className,
}: {
    offer: Offer;
    className?: string;
}) {
    const { busy, download } = usePdfDownload();

    function handleDownload() {
        download(async () => {
            const { OfferPdfDocument } = await import("./offer-pdf");
            return <OfferPdfDocument offer={offer} baseUrl={window.location.origin} />;
        }, `OpenCouncil-Προσφορά-${offer.recipientName}.pdf`);
    }

    return (
        <Button onClick={handleDownload} disabled={busy} className={className}>
            {busy ? (
                <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
            ) : (
                <FileDown className="w-4 h-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">
                {busy ? "Δημιουργία PDF…" : "Λήψη PDF"}
            </span>
        </Button>
    );
}
