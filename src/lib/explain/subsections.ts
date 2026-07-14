/**
 * Sub-sections nested under the "Πως δουλεύει το OpenCouncil;" article — the
 * product showcase rendered by ExplainFeatures. Kept in a tiny standalone module
 * (no heavy imports) so both the server page (table of contents + nav list) and
 * the client ExplainFeatures wrapper can share the ids.
 *
 * The ids follow the `oc-<featureId>` convention used in ExplainFeatures
 * (`oc-subjects`, `oc-search`, …), plus `oc-how` for the "how it works" diagram.
 */
export interface NavSection {
    id: string;
    title: string;
}

export const OPENCOUNCIL_SUBSECTIONS: NavSection[] = [
    { id: "oc-how", title: "Αναλυτικά" },
    { id: "oc-subjects", title: "Θέματα & Περιλήψεις" },
    { id: "oc-search", title: "Αναζήτηση" },
    { id: "oc-notifications", title: "Ειδοποιήσεις" },
    { id: "oc-map", title: "Χάρτης θεμάτων" },
    { id: "oc-coverage", title: "Κάλυψη" },
    { id: "oc-pricing", title: "Ποιος πληρώνει για το OpenCouncil;" },
    { id: "oc-cta", title: "Φέρτε το OpenCouncil στον δήμο σας" },
];
