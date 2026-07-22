"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FileDown, Loader2 } from "lucide-react";
import { downloadBlob } from "@/lib/utils/download";
import type { BrochureCity, BrochureData } from "./brochure-pdf";

const GENERIC = "generic";

/**
 * City picker + download button for the trifold brochure. The generic
 * variant pitches OpenCouncil; a city variant is handed to that
 * municipality's councilors during a presentation.
 *
 * Lazy-loads @react-pdf/renderer (~500KB gz) on click — keeps it out of the
 * initial page bundle.
 */
export function BrochureGenerator({
    stats,
    partners,
    cities,
    contactEmail,
    contactPhone,
}: {
    stats: BrochureData["stats"];
    partners: BrochureData["partners"];
    cities: BrochureCity[];
    contactEmail: string;
    contactPhone: string;
}) {
    const [busy, setBusy] = useState(false);
    const [cityId, setCityId] = useState<string>(GENERIC);

    async function handleDownload() {
        setBusy(true);
        try {
            const [{ pdf }, { BrochurePdf }] = await Promise.all([
                import("@react-pdf/renderer"),
                import("./brochure-pdf"),
            ]);
            const city = cities.find(c => c.id === cityId);
            const blob = await pdf(
                <BrochurePdf
                    data={{
                        stats,
                        partners,
                        baseUrl: window.location.origin,
                        contactEmail,
                        contactPhone,
                        city,
                    }}
                />
            ).toBlob();
            downloadBlob(
                blob,
                city
                    ? `OpenCouncil-Τρίπτυχο-${city.nameMunicipality}.pdf`
                    : "OpenCouncil-Τρίπτυχο.pdf"
            );
        } catch (err) {
            console.error("Failed to generate PDF:", err);
            alert("Δεν ήταν δυνατή η δημιουργία του PDF. Δοκιμάστε ξανά.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex flex-col items-center gap-3">
            <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger className="w-72">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={GENERIC}>Γενικό — παρουσίαση του OpenCouncil</SelectItem>
                    {cities.map(city => (
                        <SelectItem key={city.id} value={city.id}>
                            {city.nameMunicipality}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button onClick={handleDownload} disabled={busy} size="lg">
                {busy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                    <FileDown className="w-4 h-4 mr-2" />
                )}
                {busy ? "Δημιουργία PDF…" : "Λήψη PDF"}
            </Button>
        </div>
    );
}
