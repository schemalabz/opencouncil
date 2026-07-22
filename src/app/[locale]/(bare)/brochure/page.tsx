import { Metadata } from "next";
import Image from "next/image";
import { getAboutPageStatsCached, getCityCoverageCached, getSupportedCitiesWithLogosCached } from "@/lib/cache/queries";
import { getActiveContractAdamByCity } from "@/lib/db/offers";
import { coveredBodyTypesByCity, toBrochurePartners } from "@/lib/brochure";
import { getRealm } from "@/lib/realm.server";
import { env } from "@/env.mjs";
import { BrochureGenerator } from "@/components/brochure/brochure-generator";

export const metadata: Metadata = {
    title: "Ενημερωτικό τρίπτυχο | OpenCouncil",
    description:
        "Τρίπτυχο A4 για δημοτικούς συμβούλους: τι κάνει το OpenCouncil, βασικές λειτουργίες και η ομάδα.",
};

export default async function BrochurePage() {
    const realm = await getRealm();
    const [stats, supportedCities, adamByCity, coverage] = await Promise.all([
        getAboutPageStatsCached(),
        getSupportedCitiesWithLogosCached(),
        getActiveContractAdamByCity(),
        getCityCoverageCached(realm),
    ]);

    const partners = toBrochurePartners(supportedCities);
    const bodyTypesByCity = coveredBodyTypesByCity(coverage);

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
                        coveredBodyTypes: bodyTypesByCity[city.id],
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
