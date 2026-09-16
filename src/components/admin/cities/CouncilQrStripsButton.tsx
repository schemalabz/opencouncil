"use client";

import { useTranslations } from "next-intl";
import { Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePdfDownload } from "@/hooks/use-pdf-download";
import type { CouncilQrStrips } from "@/lib/admin/councilQrStrips";

/**
 * Downloads a city's claim QR codes as strips to cut. Every click asks the
 * server for new codes; the ones in earlier downloads stay valid until they
 * expire.
 */
export function CouncilQrStripsButton({ cityId }: { cityId: string }) {
    const t = useTranslations("admin.cities.qrStrip");
    const { toast } = useToast();
    const { busy, download } = usePdfDownload();

    function handleClick() {
        download(async () => {
            const response = await fetch(`/api/admin/cities/${encodeURIComponent(cityId)}/qr-strips`, { cache: "no-store" });
            if (!response.ok) throw new Error(`QR strips request failed with ${response.status}`);
            const strips: CouncilQrStrips = await response.json();
            if (strips.people.length === 0) {
                toast({ description: t("empty") });
                return null;
            }
            // Lazy, as the other PDFs: @react-pdf/renderer stays out of the admin bundle.
            const { CouncilQrStripsPdf } = await import("./council-qr-strips-pdf");
            const { texts } = strips;
            return (
                <CouncilQrStripsPdf
                    cityName={strips.cityName}
                    people={strips.people}
                    labels={{
                        scan: texts.scan,
                        validUntil: texts.validUntil,
                        secretCode: texts.secretCode,
                        privateLead: texts.privateLead,
                        private: (name) => texts.private.replace("{name}", name),
                    }}
                />
            );
        }, `OpenCouncil-QR-${cityId}.pdf`);
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleClick}
            disabled={busy}
            title={t("pdf")}
            aria-label={busy ? t("pdfBusy") : t("pdf")}
            className="text-muted-foreground"
        >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
        </Button>
    );
}
