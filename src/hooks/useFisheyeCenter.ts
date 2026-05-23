/**
 * The fisheye center is whatever segment is currently playing. Scroll position
 * is intentionally ignored: the user wanted layout to change only when
 * playback advances (naturally or via clicking a row to play it from there),
 * never as a side-effect of scrolling.
 *
 * This is kept as a hook (not just `activeSegmentIndex` inline) so the rule
 * stays documented in one place and remains easy to evolve.
 */
export function useFisheyeCenter(activeSegmentIndex: number | null): number | null {
    return activeSegmentIndex;
}
