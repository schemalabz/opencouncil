/**
 * Escape a string so it can be embedded in a RegExp as a literal pattern.
 * Used by the transcript find-and-replace feature.
 */
export function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Run a literal find-and-replace on `text`. The replacement is applied via
 * the function-form of `String.prototype.replace`, so `$&`, `$1`, `$$`, and
 * the rest of the replacement-string special tokens are NOT interpreted —
 * the replacement is always inserted verbatim.
 *
 * Returns the new text and the count of occurrences replaced.
 */
export function literalReplaceAll(
    text: string,
    searchTerm: string,
    replacement: string,
    caseSensitive: boolean,
): { text: string; count: number } {
    if (!searchTerm) return { text, count: 0 };
    const pattern = new RegExp(escapeRegExp(searchTerm), caseSensitive ? 'g' : 'gi');
    let count = 0;
    const next = text.replace(pattern, () => {
        count++;
        return replacement;
    });
    return { text: next, count };
}

const WORD = /\p{L}+/gu;

/**
 * Maps a match in the stored text of an utterance to the same match in its
 * displayed text, which the active locale may transliterate (Serbian). The
 * caller renders `localize(stored).slice(start, end)`.
 *
 * Transliteration works on whole words, and a letter can change length
 * (Љ → Lj, nj → њ). A boundary between words maps through the length of the
 * transliterated prefix. Inside a word that keeps its length, offsets map one
 * to one. Inside a word that changes length, a boundary that falls within a
 * digraph moves outward, so the mark covers the whole letter.
 */
export function displayMatchRange(
    stored: string,
    start: number,
    end: number,
    localize: (text: string) => string,
): [number, number] {
    const shownLength = localize(stored).length;
    const at = (offset: number, edge: 'start' | 'end'): number => {
        if (offset <= 0) return 0;
        if (offset >= stored.length) return shownLength;
        let word: { start: number; end: number } | null = null;
        for (const m of stored.matchAll(WORD)) {
            const wordStart = m.index ?? 0;
            const wordEnd = wordStart + m[0].length;
            if (wordStart < offset && offset < wordEnd) word = { start: wordStart, end: wordEnd };
            if (wordStart >= offset) break;
        }
        if (!word) return Math.min(localize(stored.slice(0, offset)).length, shownLength);

        const base = localize(stored.slice(0, word.start)).length;
        const text = stored.slice(word.start, word.end);
        const shown = localize(text);
        if (shown.length === text.length) return base + (offset - word.start);
        // Case can depend on the next letter (ЉУ → LJU), so compare without it.
        const shownLower = shown.toLowerCase();
        const step = edge === 'start' ? -1 : 1;
        for (let k = offset - word.start; k > 0 && k < text.length; k += step) {
            const prefix = localize(text.slice(0, k)).toLowerCase();
            if (shownLower.startsWith(prefix)) return base + prefix.length;
        }
        return base + (edge === 'start' ? 0 : shown.length);
    };
    return [at(start, 'start'), at(end, 'end')];
}
