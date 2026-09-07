import React from 'react';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { splitMatches } from '@/lib/search/matches';
import type { SearchMatches } from '@/lib/search/types';

/** The parts of a subject these helpers read. Structural so both the search
 *  result shape and a plain subject satisfy it. */
type SubjectText = {
    name: string;
    description?: string | null;
    location?: { text: string } | null;
    matches?: SearchMatches;
};

/** Localizer from useLocalizeText(); identity outside the Serbian realm. */
type Localize = (text: string) => string;

/** Wrap the matched spans in <mark>.
 *
 * The marker sets no colour, so a title that changes colour on hover carries
 * its emphasis with it. It sets weight and a tint instead, which read on both
 * a semibold title and body copy. */
function emphasize(text: string): React.ReactNode {
    const segments = splitMatches(text);
    if (segments.length === 1 && !segments[0].matched) return text;

    return (
        <>
            {segments.map((segment, i) =>
                segment.matched ? (
                    <mark key={i} className="rounded-[2px] bg-primary/15 font-bold text-inherit">
                        {segment.text}
                    </mark>
                ) : (
                    <React.Fragment key={i}>{segment.text}</React.Fragment>
                )
            )}
        </>
    );
}

/** A subject's title, with any search matches emphasized.
 *
 * Prefers the matched copy of the field when there is one: it is the same text
 * plus markers, so localization and markdown stripping still apply to it. */
export function subjectTitle(subject: SubjectText, localize: Localize): React.ReactNode {
    return emphasize(localize(subject.matches?.name ?? subject.name));
}

/** A subject's location, with any search matches emphasized. Null when the
 *  subject has no location — callers supply their own placeholder. */
export function subjectLocation(subject: SubjectText, localize: Localize): React.ReactNode {
    const source = subject.matches?.location_text ?? subject.location?.text;
    return source ? emphasize(localize(source)) : null;
}

/** A subject's description, markdown-stripped, with any search matches
 *  emphasized. Null when the subject has no description. */
export function subjectDescription(subject: SubjectText, localize: Localize): React.ReactNode {
    const source = subject.matches?.description ?? subject.description;
    return source ? emphasize(localize(stripMarkdown(source))) : null;
}
