import { SUBJECT_DOT_EXIT_RATIO, SUBJECT_DOT_THRESHOLD, nextDotMode, parseInitialUrlState } from './landingCore';

describe('nextDotMode', () => {
    const enter = SUBJECT_DOT_THRESHOLD;
    const exit = SUBJECT_DOT_THRESHOLD * SUBJECT_DOT_EXIT_RATIO;

    it('enters dot mode only at the entry threshold', () => {
        expect(nextDotMode(enter - 1, false)).toBe(false);
        expect(nextDotMode(enter, false)).toBe(true);
    });

    it('leaves dot mode only below the exit threshold', () => {
        expect(nextDotMode(enter - 1, true)).toBe(true); // still above exit — stays dots
        expect(nextDotMode(Math.ceil(exit), true)).toBe(true);
        expect(nextDotMode(Math.ceil(exit) - 1, true)).toBe(false);
    });

    it('is hysteretic: the band between the thresholds preserves whichever mode is active', () => {
        for (let n = Math.ceil(exit); n < enter; n++) {
            expect(nextDotMode(n, true)).toBe(true);
            expect(nextDotMode(n, false)).toBe(false);
        }
    });
});

describe('parseInitialUrlState — a committed search', () => {
    it('restores the search from a shared link', () => {
        expect(parseInitialUrlState('?search=%CE%BA%CE%B1%CF%84%CE%BF%CE%B9%CE%BA%CE%AF%CE%B4%CE%B9%CE%B1').search)
            .toBe('κατοικίδια');
    });

    // `q` is whatever is being typed; `search` is what was committed. A link
    // that carries one must not restore the other, or a half-typed word would
    // come back as a result set — or a committed search as loose text.
    it('keeps the committed search apart from the text in the box', () => {
        const typing = parseInitialUrlState('?q=κατοι');
        expect(typing.query).toBe('κατοι');
        expect(typing.search).toBe('');

        const committed = parseInitialUrlState('?search=κατοικίδια');
        expect(committed.query).toBe('');
        expect(committed.search).toBe('κατοικίδια');
    });

    it('reads no search from a link that carries none', () => {
        expect(parseInitialUrlState('?cat=t1').search).toBe('');
    });
});
