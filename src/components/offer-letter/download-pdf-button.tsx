"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import type { Offer } from "@prisma/client";

/**
 * Generates and downloads a PDF for the given offer.
 *
 * Lazy-loads @react-pdf/renderer (~500KB gz) on click — keeps it out of the
 * initial page bundle.
 */
export function DownloadPdfButton({
    offer,
    className,
}: {
    offer: Offer;
    className?: string;
}) {
    const [busy, setBusy] = useState(false);

    async function handleDownload() {
        setBusy(true);
        try {
            const [{ pdf }, { OfferPdfDocument }] = await Promise.all([
                import("@react-pdf/renderer"),
                import("./offer-pdf"),
            ]);
            const baseUrl = window.location.origin;
            const blob = await pdf(
                <OfferPdfDocument offer={offer} baseUrl={baseUrl} />
            ).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `OpenCouncil-Προσφορά-${offer.recipientName}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to generate PDF:", err);
            alert("Δεν ήταν δυνατή η δημιουργία του PDF. Δοκιμάστε ξανά.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Button onClick={handleDownload} disabled={busy} className={className}>
            {busy ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
                <FileDown className="w-4 h-4 mr-2" />
            )}
            {busy ? "Δημιουργία PDF…" : "Λήψη PDF"}
        </Button>
    );
}
