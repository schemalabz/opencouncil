import { Link2 } from "lucide-react";

/**
 * Wraps a heading's text in a self-link. On hover a link icon fades in and the
 * heading turns orange; clicking sets the section hash (/explain#<id>) so the
 * link can be copied and shared. Used for article subtitles and the nested
 * OpenCouncil feature subtitles.
 */
export function HeadingAnchor({ id, children }: { id: string; children: React.ReactNode }) {
    return (
        <a href={`#${id}`} className="unstyled group hover:text-orange">
            {children}
            {/* zero-width until hover so the (invisible) icon never forces the
                heading to wrap an empty line when the title nearly fills the column */}
            <Link2
                className="ml-1.5 inline-block h-4 w-0 overflow-hidden align-middle text-muted-foreground opacity-0 transition-all duration-200 group-hover:w-4 group-hover:opacity-100"
                aria-hidden="true"
            />
        </a>
    );
}
