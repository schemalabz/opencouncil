"use client";

import type { Realm } from "@prisma/client";
import { ArrowRight, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import HowItWorks from "@/components/about/HowItWorks";
import { FeatureBlock } from "@/components/about/OpennessFeatures";
import { OPENNESS_FEATURES } from "@/components/about/config";
import { HeadingAnchor } from "@/components/explain/HeadingAnchor";
import { CityCoverageTable } from "@/components/explain/CityCoverageTable";
import type { CoverageRow } from "@/lib/db/coverage";

/** Pricing figures for the "Ποιος πληρώνει" section, derived from the pricing config. */
export interface ExplainPricing {
    /** Combined processing price per meeting hour (digitization + human review). */
    perHour: number;
    /** Cheapest platform tier monthly price (0 ⇒ free) and its population ceiling. */
    cheapestMonthly: number;
    cheapestUpTo: number | null;
    /** Priciest platform tier monthly price and the population it kicks in above. */
    topMonthly: number;
    topFrom: number | null;
}

const fmt = (n: number) => n.toLocaleString("el-GR");

/**
 * Product showcase reused from the /about page, rendered inside the
 * "Πως δουλεύει το OpenCouncil;" section of /explain (so it matches that
 * section's width): the "how it works" diagram followed by each openness
 * feature (Θέματα & Περιλήψεις, Αναζήτηση, Ειδοποιήσεις, Χάρτης θεμάτων) with
 * its interactive demo stacked below the text (rather than inline as on /about),
 * then the per-city coverage table, pricing and the closing call to action.
 */
export function ExplainFeatures({
    realm,
    coverage,
    pricing,
}: {
    realm: Realm;
    coverage: CoverageRow[];
    pricing: ExplainPricing;
}) {
    return (
        <div className="mt-8 space-y-14 md:space-y-16">
            {/* "Πώς δουλεύει" diagram. The desktop diagram is wider than the
                article column, so it scrolls horizontally instead of being clipped
                by the layout. Anchor ids match OPENCOUNCIL_SUBSECTIONS
                (oc-how, oc-<featureId>). */}
            <div id="oc-how" className="scroll-mt-24">
                <div className="overflow-x-auto">
                    {/* Change this to retitle the box on /explain. */}
                    <HowItWorks title="Αναλυτικά" />
                </div>
            </div>
            {OPENNESS_FEATURES.map((feature, index) => (
                <div key={feature.id} id={`oc-${feature.id}`} className="scroll-mt-24">
                    <FeatureBlock
                        feature={feature}
                        index={index}
                        realm={realm}
                        layout="stacked"
                        anchorId={`oc-${feature.id}`}
                    />
                </div>
            ))}

            {/* per-city × body-type coverage table */}
            <div id="oc-coverage" className="scroll-mt-24">
                <h3 className="!text-left text-xl font-normal !leading-none text-foreground sm:text-2xl">
                    <HeadingAnchor id="oc-coverage">Κάλυψη</HeadingAnchor>
                </h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                    Το OpenCouncil καλύπτει τις δημόσιες συνεδριάσεις των δημοτικών συμβουλίων του κάθε δήμου όπου
                    συνεργάζεται. Στη σελίδα του κάθε Δήμου μπορείτε να βρείτε αναλόγως από το πότε ξεκίνησε η
                    συνεργασία μας, τα Δημοτικά Συμβούλια ή και σε συγκεκριμένους δήμους τις συνεδριάσεις των
                    Δημοτικών Επιτροπών και των Δημοτικών Κοινοτήτων.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">Παρακάτω ο αναλυτικός πίνακας κάλυψης:</p>
                <div className="mt-4">
                    <CityCoverageTable rows={coverage} />
                </div>
            </div>

            {/* pricing / who pays */}
            <div id="oc-pricing" className="scroll-mt-24">
                <h3 className="!text-left text-xl font-normal !leading-none text-foreground sm:text-2xl">
                    <HeadingAnchor id="oc-pricing">Ποιος πληρώνει για το OpenCouncil;</HeadingAnchor>
                </h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                    Οι δήμοι που συμμετέχουν στο OpenCouncil είναι και εκείνοι που πληρώνουν για αυτό.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                    Συγκεκριμένα, είναι {pricing.perHour}€ ανά ώρα συνεδρίασης για την ψηφιοποίηση και μια
                    συνδρομή ανά μήνα που καλύπτει τη λειτουργία και την ανάπτυξη του OpenCouncil. Η συνδρομή ανά
                    μήνα εξαρτάται από το μέγεθος του κάθε δήμου:{" "}
                    {pricing.cheapestMonthly === 0
                        ? `είναι δωρεάν για δήμους μέχρι ${fmt(pricing.cheapestUpTo ?? 0)} κατοίκους`
                        : `ξεκινά από ${fmt(pricing.cheapestMonthly)}€ για δήμους μέχρι ${fmt(
                              pricing.cheapestUpTo ?? 0,
                          )} κατοίκους`}{" "}
                    και έως {fmt(pricing.topMonthly)} ευρώ το μήνα για δήμους με πάνω από{" "}
                    {fmt(pricing.topFrom ?? 0)} κατοίκους.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                    Μπορείτε να αναζητήσετε τις ενεργές μας συμβάσεις ψάχνοντας στο ΚΗΜΔΗΣ για το ΑΦΜ μας{" "}
                    <strong className="font-semibold text-foreground">802666391</strong>.
                </p>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                    Το OpenCouncil μπορεί να αντικαταστήσει τα έξοδα που κάνουν ήδη οι δήμοι για τα{" "}
                    <strong className="font-semibold text-foreground">πρακτικά</strong> των συλλογικών οργάνων
                    τους και να τους γλιτώσει χρήματα.
                </p>
                <p className="mt-4 text-sm italic leading-relaxed text-muted-foreground">
                    Μπορείτε να δείτε περισσότερα σχετικά με τη διαφανή τιμολόγηση στο{" "}
                    <a
                        href="https://opencouncil.gr/about"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange underline underline-offset-2 hover:text-orange/80"
                    >
                        opencouncil.gr/about
                    </a>
                </p>
            </div>

            {/* CTA — bring OpenCouncil to your municipality */}
            <div id="oc-cta" className="not-prose scroll-mt-24 rounded-2xl bg-[#14110D] p-6 text-white sm:p-8">
                <h3 className="!text-left text-xl font-normal !leading-none sm:text-2xl">
                    <HeadingAnchor id="oc-cta">Φέρτε το OpenCouncil στον δήμο σας</HeadingAnchor>
                </h3>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {/* citizens */}
                    <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-white/5 p-5 text-center">
                        <p className="text-base font-medium text-white sm:text-lg">Αν είστε δημότης</p>
                        <Link
                            href="/petition"
                            className="unstyled group inline-flex items-center gap-2 rounded-full bg-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange/90"
                        >
                            Καταχωρήστε αίτημα
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                    {/* municipality staff / elected officials */}
                    <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-white/5 p-5 text-center">
                        <p className="text-base font-medium text-white sm:text-lg">
                            Αν δουλεύετε σε δήμο, ή είστε αιρετός / αυτοδιοικητικός
                        </p>
                        <div className="flex flex-col items-center gap-2">
                            <a
                                href="tel:+302111980212"
                                className="unstyled group inline-flex items-center gap-3 rounded-full border border-white/25 px-5 py-2.5 transition-colors hover:bg-white/10"
                            >
                                <Phone className="h-5 w-5 shrink-0 text-orange" />
                                <span className="text-left leading-tight">
                                    <span className="block text-base font-semibold text-white">
                                        +30 211 198 0212
                                    </span>
                                    <span className="block text-xs text-white/60">Καλέστε μας τώρα</span>
                                </span>
                            </a>
                            <Link
                                href="/about"
                                className="unstyled text-sm text-white/70 underline underline-offset-2 transition-colors hover:text-white"
                            >
                                Μάθετε περισσότερα
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
