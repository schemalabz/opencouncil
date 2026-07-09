"use client";

import type { Realm } from "@prisma/client";
import HowItWorks from "@/components/about/HowItWorks";
import { FeatureBlock } from "@/components/about/OpennessFeatures";
import { OPENNESS_FEATURES } from "@/components/about/config";

/**
 * Product showcase reused from the /about page, rendered inside the
 * "Πως δουλεύει το OpenCouncil;" section of /explain (so it matches that
 * section's width): the "how it works" diagram followed by each openness
 * feature (Θέματα & Περιλήψεις, Αναζήτηση, Ειδοποιήσεις, Χάρτης θεμάτων) with
 * its interactive demo stacked below the text (rather than inline as on /about).
 */
export function ExplainFeatures({ realm }: { realm: Realm }) {
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
        </div>
    );
}
