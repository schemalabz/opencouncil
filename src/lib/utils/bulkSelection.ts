/**
 * The selection rules a list with bulk actions shares. Plain functions, so the
 * rule a button counts by is the rule it acts by, and a test can pin both.
 */

/**
 * What a bulk action acts on: the ticked rows when there are any, else every
 * row the list shows. Then only the rows that action may act on, so the count
 * on its button is exactly what it will do. Each action brings its own
 * `eligible` set; the server applies the same rule again on its side.
 */
export function bulkActionScope(
    selected: ReadonlySet<string>,
    visibleIds: readonly string[],
    eligible: ReadonlySet<string>,
): string[] {
    const scope = selected.size > 0 ? [...selected] : visibleIds;
    return scope.filter(id => eligible.has(id));
}

/** The header checkbox over `ids`: all of them ticked, some, or none. */
export function headerCheckState(ids: readonly string[], selected: ReadonlySet<string>): boolean | "indeterminate" {
    const ticked = ids.filter(id => selected.has(id)).length;
    if (ticked === 0) return false;
    return ticked === ids.length ? true : "indeterminate";
}

/**
 * What the header checkbox does: untick `ids` when all of them are ticked,
 * else tick them all. Rows outside `ids` keep their state, so a search can
 * narrow the list without dropping what was ticked before it.
 */
export function toggleAll(ids: readonly string[], selected: ReadonlySet<string>): Set<string> {
    const next = new Set(selected);
    const allTicked = ids.length > 0 && ids.every(id => selected.has(id));
    for (const id of ids) {
        if (allTicked) next.delete(id);
        else next.add(id);
    }
    return next;
}
