/**
 * Sub-sections nested under the "Πως δουλεύει το OpenCouncil;" article — the
 * product showcase rendered by ExplainFeatures. Kept in a tiny standalone module
 * (no heavy imports) so both the server page (table of contents + nav list) and
 * the client ExplainFeatures wrapper can share the ids.
 *
 * The ids follow the `oc-<featureId>` convention used in ExplainFeatures
 * (`oc-subjects`, `oc-search`, …), plus `oc-stages` and `oc-ai`.
 */
export interface NavSection {
    id: string;
    title: string;
}

export const OPENCOUNCIL_SUBSECTIONS: NavSection[] = [
    { id: "oc-stages", title: "Η πορεία μιας συνεδρίασης" },
    { id: "oc-ai", title: "Η τεχνητή νοημοσύνη στο OpenCouncil" },
    { id: "oc-subjects", title: "Θέματα & Περιλήψεις" },
    { id: "oc-search", title: "Αναζήτηση" },
    { id: "oc-notifications", title: "Ενημερώσεις" },
    { id: "oc-map", title: "Χάρτης θεμάτων" },
    { id: "oc-coverage", title: "Κάλυψη" },
    { id: "oc-pricing", title: "Ποιος πληρώνει για το OpenCouncil;" },
    { id: "oc-cta", title: "Φέρτε το OpenCouncil στον δήμο σας" },
];

/** The parts of "Η τεχνητή νοημοσύνη στο OpenCouncil": heading on the page, shorter label in the table of contents. */
export const AI_SUBSECTIONS: (NavSection & { nav: string })[] = [
    { id: "oc-ai-what", title: "Τι κάνει η τεχνητή νοημοσύνη, και ποιος το ελέγχει", nav: "Τι κάνει, ποιος το ελέγχει" },
    { id: "oc-ai-not", title: "Τι δεν κάνει", nav: "Τι δεν κάνει" },
    { id: "oc-ai-label", title: "Πώς θα το αναγνωρίσετε: η σήμανση", nav: "Η σήμανση" },
    { id: "oc-ai-who", title: "Ποιος είναι υπεύθυνος για τι", nav: "Ποιος είναι υπεύθυνος" },
    { id: "oc-ai-staff", title: "Αν δουλεύετε σε δήμο: πέντε κανόνες", nav: "Πέντε κανόνες για δήμους" },
    { id: "oc-ai-models", title: "Μοντέλα και δεδομένα", nav: "Μοντέλα και δεδομένα" },
    { id: "oc-ai-errors", title: "Πού αναφέρετε ένα λάθος", nav: "Αναφορά λαθών" },
    { id: "oc-ai-registry", title: "Για τη δήλωση στο Μητρώο συστημάτων ΤΝ", nav: "Δήλωση στο Μητρώο ΤΝ" },
    { id: "oc-ai-changes", title: "Ιστορικό αλλαγών αυτής της ενότητας", nav: "Ιστορικό αλλαγών" },
];

export const AI_SUBSECTION_TITLE: Record<string, string> = Object.fromEntries(AI_SUBSECTIONS.map((s) => [s.id, s.title]));
