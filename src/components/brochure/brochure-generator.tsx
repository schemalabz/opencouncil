"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CityCombobox } from "@/components/cities/CityCombobox";
import { FileDown, Loader2 } from "lucide-react";
import { usePdfDownload } from "@/hooks/use-pdf-download";
import type { BrochureCity, BrochureData } from "./brochure-pdf";

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
    // null picks the generic variant.
    const [cityId, setCityId] = useState<string | null>(null);
    const { busy, download } = usePdfDownload();
    const options = useMemo(
        () => cities.map(city => ({ id: city.id, name: city.nameMunicipality })),
        [cities],
    );

    function handleDownload() {
        const city = cities.find(c => c.id === cityId);
        download(async () => {
            const { BrochurePdf } = await import("./brochure-pdf");
            return (
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
            );
        }, city ? `OpenCouncil-Τρίπτυχο-${city.nameMunicipality}.pdf` : "OpenCouncil-Τρίπτυχο.pdf");
    }

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="w-72">
                <CityCombobox
                    cities={options}
                    value={cityId}
                    onChange={setCityId}
                    nullOption="Γενικό — παρουσίαση του OpenCouncil"
                    searchPlaceholder="Αναζήτηση δήμου..."
                    emptyMessage="Δεν βρέθηκε δήμος."
                />
            </div>
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
