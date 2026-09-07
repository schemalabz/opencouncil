import { MATCH_START, MATCH_END } from './constants';

/** One run of fragment text, flagged when it was a matched span. */
export type MatchSegment = {
    text: string;
    matched: boolean;
};

// One capture group, so `split` alternates: plain, matched, plain, matched…
const MATCHED_SPAN = new RegExp(`${MATCH_START}([\\s\\S]*?)${MATCH_END}`);

/** Split a highlight fragment into plain and matched runs.
 *
 * Text with no markers (including every un-highlighted field) comes back as a
 * single unmatched segment, so callers need no separate fallback path. */
export function splitMatches(text: string): MatchSegment[] {
    const parts = text.split(MATCHED_SPAN);
    if (parts.length === 1) return [{ text, matched: false }];

    return parts
        .map((part, i) => ({ text: part, matched: i % 2 === 1 }))
        .filter(segment => segment.text.length > 0);
}
