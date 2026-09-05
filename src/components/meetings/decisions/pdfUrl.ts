import type { DiavgeiaUnitScope } from '@/lib/utils/diavgeiaUnitScope';

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

/**
 * The portal's advanced search, filtered to an organization and optionally to
 * one configured unit scope (a unit, or a unit and a signer). The portal reads
 * the organization from the Lucene `query` and the unit and signer from
 * repeatable `fq` filters; unit and signer terms inside `query` are ignored.
 */
export function diavgeiaSearchUrl(organizationUid: string, scope?: DiavgeiaUnitScope): string {
    const params = new URLSearchParams({ advanced: 'true', query: `organizationUid:"${organizationUid}"`, page: '0' });
    if (scope) params.append('fq', `unitUid:"${scope.unit}"`);
    if (scope?.signer) params.append('fq', `signerUid:"${scope.signer}"`);
    return `https://diavgeia.gov.gr/search?${params.toString()}`;
}
