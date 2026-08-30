/**
 * Compact a markdown text (a subject description) into a metadata
 * description: keep link labels, drop link targets (including internal
 * REF:UTTERANCE markers), strip markdown tokens, collapse whitespace,
 * and cap the length with an ellipsis.
 */
export function compactMetadataDescription(value: string, maxLength = 180): string {
    const compact = value
        .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
        .replace(/[#*_>`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trimEnd()}…` : compact;
}
