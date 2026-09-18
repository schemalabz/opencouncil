/**
 * Email checks for the join flow, shared by the form and the action. The
 * readers are not used to typing their address on a phone, so the form
 * also catches the usual slips in the domain before a link goes nowhere.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function isLikelyEmail(email: string): boolean {
    return EMAIL_RE.test(normalizeEmail(email));
}

const DOMAIN_FIXES: Record<string, string> = {
    'gmial.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gmal.com': 'gmail.com',
    'gmail.co': 'gmail.com',
    'gmail.con': 'gmail.com',
    'gmail.cm': 'gmail.com',
    'gmail.gr': 'gmail.com',
    'gnail.com': 'gmail.com',
    'hotmai.com': 'hotmail.com',
    'hotmial.com': 'hotmail.com',
    'hotmail.co': 'hotmail.com',
    'hotmail.con': 'hotmail.com',
    'hotmail.gr': 'hotmail.com',
    'yaho.com': 'yahoo.com',
    'yahooo.com': 'yahoo.com',
    'yahoo.co': 'yahoo.com',
    'yahoo.con': 'yahoo.com',
    'outlok.com': 'outlook.com',
    'outlook.co': 'outlook.com',
    'outlook.con': 'outlook.com',
};

/** The address with a known domain slip fixed, or null when nothing looks wrong. */
export function suggestEmailFix(email: string): string | null {
    const normalized = normalizeEmail(email);
    const at = normalized.lastIndexOf('@');
    if (at < 1) return null;
    const fixed = DOMAIN_FIXES[normalized.slice(at + 1)];
    return fixed ? `${normalized.slice(0, at)}@${fixed}` : null;
}
