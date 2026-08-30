import { stripMarkdown } from "@/lib/formatters/markdown";

/**
 * Flatten a markdown subject description into a metadata description:
 * strip markdown via the shared helper, then cap the length with an
 * ellipsis. The cap counts code points, so an emoji at the boundary
 * cannot leave a lone surrogate in the output.
 */
export function compactMetadataDescription(value: string, maxLength = 180): string {
    const stripped = stripMarkdown(value);
    const chars = Array.from(stripped);
    if (chars.length <= maxLength) {
        return stripped;
    }
    return `${chars.slice(0, maxLength - 1).join("").trimEnd()}…`;
}
