/**
 * Diavgeia answers 404 for an ΑΔΑ in lowercase or with Latin letters that
 * look Greek, so a hand-typed ΑΔΑ must be brought to Diavgeia's own form
 * before it is sent. The tasks server keeps a copy of this rule
 * (opencouncil-tasks `src/tasks/utils/ada.ts`); change both together.
 */
const LATIN_TO_GREEK: Record<string, string> = {
    A: 'Α', B: 'Β', E: 'Ε', Z: 'Ζ', H: 'Η', I: 'Ι', K: 'Κ',
    M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', Y: 'Υ', X: 'Χ',
};

const ADA_PATTERN = /^[0-9Α-Ω]+(-[0-9Α-Ω]+)+$/;

export function normalizeAda(input: string): string | null {
    const upper = input.trim().toLocaleUpperCase('el');
    const greek = [...upper].map(c => LATIN_TO_GREEK[c] ?? c).join('');
    return ADA_PATTERN.test(greek) ? greek : null;
}

/** The ΑΔΑ in a diavgeia.gov.gr document or view link, so a pasted link can take the ΑΔΑ route. */
export function adaFromDiavgeiaUrl(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url.trim());
    } catch {
        return null;
    }
    const hostname = parsed.hostname;
    if (hostname !== 'diavgeia.gov.gr' && !hostname.endsWith('.diavgeia.gov.gr')) {
        return null;
    }
    let last: string;
    try {
        last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
    } catch {
        return null;
    }
    return normalizeAda(last);
}
