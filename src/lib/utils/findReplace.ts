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
