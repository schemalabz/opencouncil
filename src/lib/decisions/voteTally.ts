/**
 * The numbers a vote phrase carries, when it carries any. «Κατά πλειοψηφία με
 * 12 υπέρ και 3 κατά» → 12 / 3; «Με δεκαέξι (16) θετικές ψήφους» → 16;
 * «Ομόφωνα» → nothing. Greek number words are read only through the bracketed
 * digit that usually follows them. JavaScript's \b is ASCII-only, so word ends
 * are checked with a Unicode lookahead.
 */
export interface VoteTally {
    for: number | null;
    against: number | null;
    blank: number | null;
}

const num = String.raw`(\d+)`;
const FOR = new RegExp(String.raw`(?:${num}\s*(?:\)\s*)?(?:ψήφ(?:οι|ους|ων|ος)?\s*)?(?:υπ[εέ]ρ|θετικ)|(?:υπ[εέ]ρ|θετικ[εέ]ς ψήφ(?:οι|ους)?)\s*:?\s*\(?${num})`, 'iu');
const AGAINST = new RegExp(String.raw`(?:${num}\s*(?:\)\s*)?(?:ψήφ(?:οι|ους|ων|ος)?\s*)?(?:κατ[αά](?!\p{L})|αρνητικ)|(?:κατ[αά](?!\p{L})|αρνητικ[εέ]ς ψήφ(?:οι|ους)?)\s*:?\s*\(?${num})`, 'iu');
const BLANK = new RegExp(String.raw`(?:${num}\s*(?:\)\s*)?(?:ψήφ(?:οι|ους|ων|ος)?\s*)?λευκ|λευκ[αάοό]?\s*:?\s*\(?${num})`, 'iu');

const pick = (m: RegExpMatchArray | null): number | null => {
    if (!m) return null;
    const v = m[1] ?? m[2];
    return v ? parseInt(v, 10) : null;
};

export function parseVoteTally(phrase: string | null | undefined): VoteTally {
    if (!phrase) return { for: null, against: null, blank: null };
    // «των τριών (3) μελών» counts those present, not a vote split.
    const p = phrase.replace(/\((\d+)\)\s*μελ/gi, 'μελ');
    return { for: pick(p.match(FOR)), against: pick(p.match(AGAINST)), blank: pick(p.match(BLANK)) };
}
