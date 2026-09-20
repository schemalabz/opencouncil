/**
 * Parsing of `AdministrativeBody.diavgeiaUnitIds` entries (issue #330).
 *
 * Some municipalities publish several administrative bodies under one Diavgeia
 * unit — Athens publishes all 7 Δημοτικές Κοινότητες under unit `84655`. The unit
 * alone cannot separate them, but the signer can: each community's decisions
 * carry that community president's signer UID.
 *
 * An entry is therefore `unit[:signer]`. A bare `"81689"` keeps its old meaning
 * and filters by unit only. Each entry describes one independent Diavgeia query,
 * and the consumer unions the results by ADA — so a body may mix bare and scoped
 * entries freely, on the same unit or on different ones.
 *
 * Every consumer must parse through this module. Diavgeia's own `unitIds` on a
 * decision never carry a signer suffix, so comparing a configured entry to them
 * by string equality silently admits nothing.
 */

export interface DiavgeiaUnitScope {
    unit: string;
    signer?: string;
}

/**
 * Parse one entry. Returns null for a blank entry. Throws on a malformed one:
 * skipping it would narrow the poll silently, and truncating it would turn a
 * typo into a valid-looking narrower scope.
 */
export function parseDiavgeiaUnitScope(entry: string): DiavgeiaUnitScope | null {
    if (!entry.trim()) return null;
    const parts = entry.split(':').map(part => part.trim());
    if (parts.length > 2 || !parts[0]) {
        throw new Error(`Malformed diavgeiaUnitIds entry "${entry}" — expected unit or unit:signer`);
    }
    const [unit, signer] = parts;
    return signer ? { unit, signer } : { unit };
}

/**
 * Parse configured entries into the scopes they describe, skipping blank ones.
 * Unlike the opencouncil-tasks twin, an empty configuration yields [] here, not
 * an org-wide scope — this repo configures; only the task queries.
 */
export function parseDiavgeiaUnitScopes(entries: string[] | null | undefined): DiavgeiaUnitScope[] {
    return (entries ?? [])
        .map(parseDiavgeiaUnitScope)
        .filter((scope): scope is DiavgeiaUnitScope => scope !== null);
}

/**
 * The entries to store when a unit is re-resolved for a body — the rule
 * `import_diavgeia --force` needs.
 *
 * Resolution matches units by name and cannot discover signers. So where it
 * resolves to a unit the body already configures, the configured entries win:
 * they may carry hand-configured signer suffixes. Where it resolves to a
 * different unit, the resolution wins.
 */
export function entriesForResolvedUnit(
    existing: string[] | null | undefined,
    resolvedUnit: string,
): string[] {
    const configured = (existing ?? []).filter(
        entry => parseDiavgeiaUnitScope(entry)?.unit === resolvedUnit,
    );
    return configured.length > 0 ? configured : [resolvedUnit];
}

/** One configured entry, read: the scope it names, or why it could not be read. */
export interface ReadDiavgeiaUnitEntry {
    /** The entry exactly as configured, for display. */
    entry: string;
    scope: DiavgeiaUnitScope | null;
    error: string | null;
}

/**
 * Every configured entry, read one at a time.
 *
 * A malformed entry must not narrow a poll silently, so {@link parseDiavgeiaUnitScopes}
 * throws. A page that only wants to *show* the configured scope needs the message
 * instead of the exception — and needs it per entry, so one bad entry marks itself
 * rather than hiding the good ones beside it. Both admin surfaces that display a
 * body's scope read through this, or the same configuration renders two ways.
 */
export function readDiavgeiaUnitEntries(entries: string[] | null | undefined): ReadDiavgeiaUnitEntry[] {
    return (entries ?? []).flatMap((entry): ReadDiavgeiaUnitEntry[] => {
        try {
            const scope = parseDiavgeiaUnitScope(entry);
            return scope ? [{ entry, scope, error: null }] : [];
        } catch (e) {
            return [{ entry, scope: null, error: e instanceof Error ? e.message : String(e) }];
        }
    });
}
