"use client";

import { useTranslations } from "next-intl";
import { Loader2, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionCount } from "@/components/admin/ActionCount";
import { useToast } from "@/hooks/use-toast";
import { usePdfDownload } from "@/hooks/use-pdf-download";
import type { CouncilQrStrips } from "@/lib/admin/councilQrStrips";

/**
 * Downloads a city's claim QR codes as strips to cut. Every click asks the
 * server for new codes; the ones in earlier downloads stay valid until they
 * expire. An icon in a table row; with `labelled`, a button with its name.
 *
 * With `personIds`, only those people: the button shows how many and is off
 * at none. The server still decides who is eligible among them. `fileLabel`
 * goes into the file name, so one download per body stays tellable apart.
 */
export function CouncilQrStripsButton({ cityId, labelled = false, personIds, fileLabel }: {
    cityId: string;
    labelled?: boolean;
    personIds?: string[];
    fileLabel?: string;
}) {
    const t = useTranslations("admin.cities.qrStrip");
    const { toast } = useToast();
    const { busy, download } = usePdfDownload();

    function handleClick() {
        download(async () => {
            const url = `/api/admin/cities/${encodeURIComponent(cityId)}/qr-strips`;
            const response = personIds
                ? await fetch(url, { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personIds }) })
                : await fetch(url, { cache: "no-store" });
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
        }, fileLabel ? `OpenCouncil-QR-${cityId}-${fileLabel}.pdf` : `OpenCouncil-QR-${cityId}.pdf`);
    }

    const icon = busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />;
    if (labelled) {
        const none = personIds !== undefined && personIds.length === 0;
        return (
            <Button variant="outline" size="sm" onClick={handleClick} disabled={busy || none} className="gap-2">
                {icon}
                {busy ? t("pdfBusy") : t("button")}
                {personIds && <ActionCount count={personIds.length} />}
            </Button>
        );
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
            {icon}
        </Button>
    );
}
