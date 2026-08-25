/** Diavgeia serves Content-Disposition: attachment unless inline=true is passed. */
export function inlinePdfUrl(pdfUrl: string): string {
    if (!pdfUrl.includes('diavgeia.gov.gr/doc/')) return pdfUrl;
    return pdfUrl + (pdfUrl.includes('?') ? '&' : '?') + 'inline=true';
}

/** The document PDF on Diavgeia for an ADA. */
export function diavgeiaDocUrl(ada: string): string {
    return `https://diavgeia.gov.gr/doc/${encodeURIComponent(ada)}`;
}

/** The decision's page on the Diavgeia portal. */
export function diavgeiaViewUrl(ada: string): string {
    return `https://diavgeia.gov.gr/decision/view/${encodeURIComponent(ada)}`;
}
