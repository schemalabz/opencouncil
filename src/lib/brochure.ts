/**
 * Shared helpers for the trifold brochure.
 */

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
