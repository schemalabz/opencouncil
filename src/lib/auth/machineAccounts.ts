/**
 * A machine account is a User row that a service holds (#590): it never
 * signs in, and its MCP tokens carry its rights like a person's. Its address
 * is on a reserved domain: `.invalid` never resolves (RFC 2606), so no mail
 * reaches it, and signInGuard refuses the domain, so no magic link or
 * provider can sign it in.
 *
 * No database import: auth.config.ts and the client read this module too.
 */
export const MACHINE_ACCOUNT_DOMAIN = 'machines.opencouncil.invalid';

/**
 * The local part of a machine address, from the label: lowercase Latin
 * letters and digits, every other run replaced by one dash. Null when
 * nothing is left, so a label that is only punctuation or non-Latin script
 * is refused rather than given an empty address.
 */
export function machineAccountSlug(label: string): string | null {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || null;
}

export function machineAccountAddress(slug: string): string {
    return `${slug}@${MACHINE_ACCOUNT_DOMAIN}`;
}

export function isMachineAccountAddress(email: string | null | undefined): boolean {
    return typeof email === 'string' && email.trim().toLowerCase().endsWith(`@${MACHINE_ACCOUNT_DOMAIN}`);
}
