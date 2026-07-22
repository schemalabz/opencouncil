/**
 * Shared helpers for the trifold brochure.
 */
import type { AdministrativeBodyType } from "@prisma/client";
import type { CoverageRow } from "@/lib/db/coverage";

const BODY_TYPE_ORDER: AdministrativeBodyType[] = ["council", "committee", "community"];

/**
 * Administrative body types with at least one released past meeting, per
 * city — derived from the same coverage rows as the /explain "Κάλυψη"
 * section (getCityCoverage), so the two surfaces can't drift.
 */
export function coveredBodyTypesByCity(
    rows: CoverageRow[]
): Record<string, AdministrativeBodyType[]> {
    const byCity: Record<string, AdministrativeBodyType[]> = {};
    for (const row of rows) {
        (byCity[row.cityId] ??= []).push(row.bodyType);
    }
    for (const types of Object.values(byCity)) {
        types.sort((a, b) => BODY_TYPE_ORDER.indexOf(a) - BODY_TYPE_ORDER.indexOf(b));
    }
    return byCity;
}

/**
 * The cover-subtitle subject for the covered body types, with correct Greek
 * agreement, e.g.:
 *   [council]                      → "Δημοτικά συμβούλια … πιο ανοιχτά"
 *   [council, committee]           → "Δημοτικά συμβούλια και επιτροπές"
 *   [council, committee, community]→ "Δημοτικά συμβούλια, επιτροπές και κοινότητες"
 *   [committee, community]         → "Δημοτικές επιτροπές και κοινότητες … πιο ανοιχτές"
 * Mixed-gender lists take the neuter adjective (standard Greek); a list
 * without συμβούλια is feminine-only.
 */
export function bodyTypesPhrase(types: AdministrativeBodyType[]): {
    subject: string;
    feminine: boolean;
} {
    const ordered = BODY_TYPE_ORDER.filter(t => types.includes(t));
    const feminine = !ordered.includes("council");
    const labels = ordered.map((t, i) => {
        if (t === "council") return "Δημοτικά συμβούλια";
        const bare = t === "committee" ? "επιτροπές" : "κοινότητες";
        return i === 0 ? `Δημοτικές ${bare}` : bare;
    });
    const subject =
        labels.length <= 1
            ? labels.join("")
            : `${labels.slice(0, -1).join(", ")} και ${labels[labels.length - 1]}`;
    return { subject, feminine };
}

/**
 * Map supported cities to brochure partner entries (name + logo URL).
 *
 * react-pdf can only draw raster images — the upload side enforces this via
 * ALLOWED_LOGO_CONTENT_TYPES in @/types/upload — so legacy SVG logos that
 * predate the restriction are skipped. Re-uploading the logo (the crop step
 * converts to PNG) brings the municipality back into the grid.
 */
export function toBrochurePartners(
    cities: Array<{ logoImage: string | null; name_municipality: string }>
): Array<{ name: string; logo: string }> {
    return cities
        .filter(
            (city): city is { logoImage: string; name_municipality: string } =>
                !!city.logoImage && !city.logoImage.toLowerCase().endsWith(".svg")
        )
        .map(city => ({ name: city.name_municipality, logo: city.logoImage }));
}
