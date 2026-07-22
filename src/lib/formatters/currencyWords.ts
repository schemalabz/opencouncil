/**
 * Euro amounts in Greek words, title-cased as used in formal offer documents:
 *   15200    → "Δεκαπέντε Χιλιάδες Διακόσια Ευρώ"
 *   18848    → "Δεκαοκτώ Χιλιάδες Οκτακόσια Σαράντα Οκτώ Ευρώ"
 *   12055.5  → "Δώδεκα Χιλιάδες Πενήντα Πέντε Ευρώ και Πενήντα Λεπτά"
 *
 * Gender note: hundreds and units agree with the counted noun — neuter for
 * ευρώ/λεπτά ("Διακόσια", "Τέσσερα"), feminine for χιλιάδες ("Διακόσιες
 * Χιλιάδες", "Τρεις Χιλιάδες", "Μία Χιλιάδα" is written "Χίλια" as neuter
 * per the conventional accounting style).
 */

type Gender = 'neuter' | 'feminine';

const UNITS_NEUTER = ['', 'Ένα', 'Δύο', 'Τρία', 'Τέσσερα', 'Πέντε', 'Έξι', 'Επτά', 'Οκτώ', 'Εννέα'];
const UNITS_FEMININE = ['', 'Μία', 'Δύο', 'Τρεις', 'Τέσσερις', 'Πέντε', 'Έξι', 'Επτά', 'Οκτώ', 'Εννέα'];
const TEENS_NEUTER = ['Δέκα', 'Έντεκα', 'Δώδεκα', 'Δεκατρία', 'Δεκατέσσερα', 'Δεκαπέντε', 'Δεκαέξι', 'Δεκαεπτά', 'Δεκαοκτώ', 'Δεκαεννέα'];
const TEENS_FEMININE = ['Δέκα', 'Έντεκα', 'Δώδεκα', 'Δεκατρείς', 'Δεκατέσσερις', 'Δεκαπέντε', 'Δεκαέξι', 'Δεκαεπτά', 'Δεκαοκτώ', 'Δεκαεννέα'];
const TENS = ['', '', 'Είκοσι', 'Τριάντα', 'Σαράντα', 'Πενήντα', 'Εξήντα', 'Εβδομήντα', 'Ογδόντα', 'Ενενήντα'];
const HUNDREDS_NEUTER = ['', 'Εκατόν', 'Διακόσια', 'Τριακόσια', 'Τετρακόσια', 'Πεντακόσια', 'Εξακόσια', 'Επτακόσια', 'Οκτακόσια', 'Εννιακόσια'];
const HUNDREDS_FEMININE = ['', 'Εκατόν', 'Διακόσιες', 'Τριακόσιες', 'Τετρακόσιες', 'Πεντακόσιες', 'Εξακόσιες', 'Επτακόσιες', 'Οκτακόσιες', 'Εννιακόσιες'];

/** 1–999 in words. */
function threeDigits(n: number, gender: Gender): string {
    const parts: string[] = [];
    const h = Math.floor(n / 100);
    const rest = n % 100;

    if (h > 0) {
        // Bare 100 is "Εκατό"; 101-199 use "Εκατόν".
        if (h === 1 && rest === 0) {
            parts.push('Εκατό');
        } else {
            parts.push((gender === 'feminine' ? HUNDREDS_FEMININE : HUNDREDS_NEUTER)[h]);
        }
    }

    if (rest >= 10 && rest <= 19) {
        parts.push((gender === 'feminine' ? TEENS_FEMININE : TEENS_NEUTER)[rest - 10]);
    } else {
        const t = Math.floor(rest / 10);
        const u = rest % 10;
        if (t > 0) parts.push(TENS[t]);
        if (u > 0) parts.push((gender === 'feminine' ? UNITS_FEMININE : UNITS_NEUTER)[u]);
    }

    return parts.join(' ');
}

/** 0–999,999,999 in words (neuter counted noun). */
function integerInWords(n: number): string {
    if (n === 0) return 'Μηδέν';

    const parts: string[] = [];

    const millions = Math.floor(n / 1_000_000);
    const thousands = Math.floor((n % 1_000_000) / 1000);
    const rest = n % 1000;

    if (millions > 0) {
        parts.push(
            millions === 1
                ? 'Ένα Εκατομμύριο'
                : `${threeDigits(millions, 'neuter')} Εκατομμύρια`
        );
    }
    if (thousands > 0) {
        parts.push(thousands === 1 ? 'Χίλια' : `${threeDigits(thousands, 'feminine')} Χιλιάδες`);
    }
    if (rest > 0) {
        parts.push(threeDigits(rest, 'neuter'));
    }

    return parts.join(' ');
}

/**
 * Full amount in words: "Δεκαπέντε Χιλιάδες Διακόσια Ευρώ", with cents as
 * "… και Πενήντα Λεπτά" when present.
 */
export function euroAmountInWords(amount: number): string {
    const cents = Math.round(amount * 100);
    const euros = Math.floor(cents / 100);
    const lepta = cents % 100;

    const euroPart = `${integerInWords(euros)} Ευρώ`;
    if (lepta === 0) return euroPart;

    const leptaWords = integerInWords(lepta);
    return `${euroPart} και ${leptaWords} ${lepta === 1 ? 'Λεπτό' : 'Λεπτά'}`;
}
