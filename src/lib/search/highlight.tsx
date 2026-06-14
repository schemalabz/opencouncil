import React from "react";
import { HIGHLIGHT_START, HIGHLIGHT_END } from "./constants";
import { stripMarkdown } from "@/lib/formatters/markdown";

/**
 * Renders an Elasticsearch highlight fragment as React nodes, bolding the matched
 * spans. The fragment uses the HIGHLIGHT_START/HIGHLIGHT_END sentinel tags (not
 * HTML), so we split on plain strings — no markup parsing, no dangerouslySetInnerHTML.
 * React escapes the text nodes, so user/content input is safe. Greek-safe (plain
 * string split, no regex character classes or case folding).
 *
 * When `stripMd` is set, markdown is stripped from the WHOLE fragment before
 * splitting (descriptions are markdown; titles are plain). Stripping the whole
 * fragment first — rather than per text node — preserves boundary whitespace
 * (stripMarkdown trims/collapses), and the sentinel tags survive stripping since
 * they contain only `_`/letters that no markdown rule touches.
 *
 * @param highlight  the ES fragment with sentinel tags, or undefined
 * @param fallback   plain text to render when no highlight is present
 * @param stripMd    when true, run stripMarkdown before splitting
 */
export function renderHighlighted(
    highlight: string | undefined,
    fallback: string,
    stripMd = false
): React.ReactNode {
    // No highlight at all: render the plain fallback (the raw field value).
    if (!highlight) {
        return stripMd ? stripMarkdown(fallback) : fallback;
    }

    const source = stripMd ? stripMarkdown(highlight) : highlight;

    // Highlight present but no markers (e.g. ES returned the field unmarked):
    // render the fragment text as-is, no bolding.
    if (!source.includes(HIGHLIGHT_START)) {
        return source;
    }

    const nodes: React.ReactNode[] = [];
    let rest = source;
    let key = 0;

    while (rest.length > 0) {
        const start = rest.indexOf(HIGHLIGHT_START);
        if (start === -1) {
            nodes.push(<React.Fragment key={key++}>{rest}</React.Fragment>);
            break;
        }

        // Plain text before the marked span
        const before = rest.slice(0, start);
        if (before) nodes.push(<React.Fragment key={key++}>{before}</React.Fragment>);

        const afterStart = rest.slice(start + HIGHLIGHT_START.length);
        const end = afterStart.indexOf(HIGHLIGHT_END);
        if (end === -1) {
            // Malformed (no closing tag): render the remainder as plain text
            if (afterStart) nodes.push(<React.Fragment key={key++}>{afterStart}</React.Fragment>);
            break;
        }

        const matched = afterStart.slice(0, end);
        if (matched) {
            nodes.push(
                <strong key={key++} className="font-semibold text-foreground">
                    {matched}
                </strong>
            );
        }

        rest = afterStart.slice(end + HIGHLIGHT_END.length);
    }

    return <>{nodes}</>;
}
