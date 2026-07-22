import { Metadata } from "next";
import Image from "next/image";
import { getAboutPageStatsCached, getSupportedCitiesWithLogosCached } from "@/lib/cache/queries";
import { getActiveContractAdamByCity } from "@/lib/db/offers";
import { env } from "@/env.mjs";
import { BrochureGenerator } from "@/components/brochure/brochure-generator";

export const metadata: Metadata = {
    title: "Ενημερωτικό τρίπτυχο | OpenCouncil",
    description:
        "Τρίπτυχο A4 για δημοτικούς συμβούλους: τι κάνει το OpenCouncil, βασικές λειτουργίες και η ομάδα.",
};

export default async function BrochurePage() {
    const [stats, supportedCities, adamByCity] = await Promise.all([
        getAboutPageStatsCached(),
        getSupportedCitiesWithLogosCached(),
        getActiveContractAdamByCity(),
    ]);

    // react-pdf can only draw PNG/JPEG — skip legacy SVG logos that predate
    // the raster-only upload restriction (re-upload the logo to fix).
    const partners = supportedCities
        .filter(city => !city.logoImage.toLowerCase().endsWith(".svg"))
        .map(city => ({ name: city.name_municipality, logo: city.logoImage }));

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-16">
            <div className="max-w-md text-center space-y-6">
                <Image
                    src="/logo.png"
                    alt="OpenCouncil"
                    width={56}
                    height={47}
                    className="mx-auto"
                />
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold">Ενημερωτικό τρίπτυχο</h1>
                    <p className="text-muted-foreground">
                        Τρίπτυχο A4 δύο όψεων για δημοτικούς συμβούλους — τι κάνει το
                        OpenCouncil, βασικές λειτουργίες και η ομάδα, με τα τρέχοντα στοιχεία
                        της πλατφόρμας. Επιλέξτε δήμο για την παραλλαγή που μοιράζεται σε
                        παρουσίαση στο δημοτικό συμβούλιο.
                    </p>
                </div>
                <BrochureGenerator
                    stats={stats}
                    partners={partners}
                    cities={supportedCities.map(city => ({
                        id: city.id,
                        nameMunicipality: city.name_municipality,
                        adam: adamByCity[city.id],
                    }))}
                    contactEmail={env.NEXT_PUBLIC_CONTACT_EMAIL ?? "christos@opencouncil.gr"}
                    contactPhone={env.NEXT_PUBLIC_CONTACT_PHONE ?? "+30 6980586851"}
                />
                <p className="text-xs text-muted-foreground">
                    Εκτύπωση διπλής όψης σε A4 οριζόντια, με αναστροφή στη μικρή πλευρά
                    (flip on short edge) — δίπλωμα στα τρία, στα σημάδια των περιθωρίων.
                </p>
            </div>
        </div>
    );
}
