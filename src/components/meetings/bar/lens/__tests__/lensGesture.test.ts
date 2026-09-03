import { CLOSED, lensReducer, lensWidthFor, type LensContext, type LensEvent, type LensState } from '../lensGesture';

// a 4-hour meeting on a 1000px strip that starts 300px into a 1440px viewport, a 600px lens
const ctx: LensContext = { duration: 14400, lensEnabled: true, lensWidth: 600, stripLeft: 300, stripWidth: 1000, viewportWidth: 1440 };

function run(events: LensEvent[], start: LensState = CLOSED, context = ctx) {
    let state = start;
    const effects = [];
    for (const event of events) {
        const next = lensReducer(state, event, context);
        state = next.state;
        effects.push(...next.effects);
    }
    return { state, effects };
}

describe('lensReducer — mouse', () => {
    it('follows the pointer along the strip with the window centred', () => {
        const { state } = run([{ type: 'stripMove', x: 500 }]);
        expect(state.phase).toBe('following');
        expect(state.time).toBe(7200);
        expect(state.windowStart).toBe(6900);
        expect(state.lensLeft).toBe(200);
    });

    it('stays closed below the gate but still tracks the time for the tooltip', () => {
        const { state } = run([{ type: 'stripMove', x: 500 }], CLOSED, { ...ctx, lensEnabled: false });
        expect(state.phase).toBe('closed');
        expect(state.time).toBe(7200);
    });

    it('pins the window when the pointer leaves the strip into the lens, and follows the pointer inside it', () => {
        const { state } = run([{ type: 'stripMove', x: 500 }, { type: 'stripLeave', intoLens: true }, { type: 'lensMove', fraction: 0.25 }]);
        expect(state.phase).toBe('pinned');
        expect(state.windowStart).toBe(6900);
        expect(state.time).toBe(7050);
        expect(state.lensLeft).toBe(200);
    });

    it('seeks precisely on a click inside the pinned lens and stays open', () => {
        const { state, effects } = run([{ type: 'stripMove', x: 500 }, { type: 'stripLeave', intoLens: true }, { type: 'lensClick', fraction: 0.5 }]);
        expect(effects).toEqual([{ type: 'seek', time: 7200, precision: 'fine' }]);
        expect(state.phase).toBe('pinned');
    });

    it('resumes following when the pointer comes back to the strip, and closes when it leaves elsewhere', () => {
        const back = run([{ type: 'stripMove', x: 500 }, { type: 'stripLeave', intoLens: true }, { type: 'lensLeave', intoStrip: true }, { type: 'stripMove', x: 600 }]);
        expect(back.state.phase).toBe('following');
        expect(back.state.windowStart).toBe(8340);
        const away = run([{ type: 'stripMove', x: 500 }, { type: 'stripLeave', intoLens: true }, { type: 'lensLeave', intoStrip: false }]);
        expect(away.state.phase).toBe('closed');
        const off = run([{ type: 'stripMove', x: 500 }, { type: 'stripLeave', intoLens: false }]);
        expect(off.state.phase).toBe('closed');
    });

    it('seeks coarsely on a strip click without changing phase', () => {
        const { state, effects } = run([{ type: 'stripMove', x: 500 }, { type: 'stripClick', x: 510 }]);
        expect(effects).toEqual([{ type: 'seek', time: 7344, precision: 'coarse' }]);
        expect(state.phase).toBe('following');
    });
});

describe('lensReducer — touch', () => {
    it('opens coarse on the finger and follows it along the strip', () => {
        const { state } = run([{ type: 'down', x: 100 }, { type: 'touchMove', x: 200, clientX: 500, region: 'strip' }]);
        expect(state.phase).toBe('coarse');
        expect(state.time).toBe(2880);
        expect(state.windowStart).toBe(2580);
    });

    it('turns fine when the finger slides up, moving by lens pixels and sliding the window at the edge', () => {
        const start = run([{ type: 'down', x: 500 }, { type: 'touchMove', x: 500, clientX: 800, region: 'lens' }]);
        expect(start.state.phase).toBe('fine');
        expect(start.state.fineX).toBe(800);
        // 60 lens px = 60 s on a 600px lens
        const moved = run([{ type: 'touchMove', x: 560, clientX: 860, region: 'same' }], start.state);
        expect(moved.state).toMatchObject({ phase: 'fine', time: 7260, windowStart: 6900, fineX: 860 });
        // past the window's right edge (6900 + 600 = 7500) the window slides along
        const far = run([{ type: 'touchMove', x: 860, clientX: 1160, region: 'same' }], moved.state);
        expect(far.state).toMatchObject({ time: 7560, windowStart: 6960 });
    });

    it('returns to coarse when the finger comes back down to the strip', () => {
        const { state } = run([{ type: 'down', x: 500 }, { type: 'touchMove', x: 500, clientX: 800, region: 'lens' }, { type: 'touchMove', x: 700, clientX: 1000, region: 'strip' }]);
        expect(state.phase).toBe('coarse');
        expect(state.time).toBe(10080);
        expect(state.fineX).toBeNull();
    });

    it('seeks where it was on release, at the precision of the phase, and suppresses the synthesized click', () => {
        const coarse = run([{ type: 'down', x: 500 }, { type: 'up' }]);
        expect(coarse.effects).toEqual([{ type: 'seek', time: 7200, precision: 'coarse' }, { type: 'suppressClick' }]);
        expect(coarse.state.phase).toBe('closed');
        const fine = run([{ type: 'down', x: 500 }, { type: 'touchMove', x: 500, clientX: 800, region: 'lens' }, { type: 'touchMove', x: 530, clientX: 830, region: 'same' }, { type: 'up' }]);
        expect(fine.effects).toEqual([{ type: 'seek', time: 7230, precision: 'fine' }, { type: 'suppressClick' }]);
    });

    it('never turns fine below the gate', () => {
        const { state } = run([{ type: 'down', x: 500 }, { type: 'touchMove', x: 500, clientX: 800, region: 'lens' }], CLOSED, { ...ctx, lensEnabled: false });
        expect(state.phase).toBe('coarse');
    });

    it('closes without seeking on cancel', () => {
        const { state, effects } = run([{ type: 'down', x: 500 }, { type: 'cancel' }]);
        expect(state.phase).toBe('closed');
        expect(effects).toEqual([]);
    });

    it('ignores a mouse move while a finger holds the strip', () => {
        const { state } = run([{ type: 'down', x: 500 }, { type: 'stripMove', x: 900 }]);
        expect(state.phase).toBe('coarse');
        expect(state.time).toBe(7200);
    });
});

describe('lensReducer — no duration', () => {
    it('neither opens nor seeks while the strip has no duration', () => {
        const events: LensEvent[] = [{ type: 'stripMove', x: 500 }, { type: 'stripClick', x: 500 }, { type: 'down', x: 500 }, { type: 'up' }];
        const { state, effects } = run(events, CLOSED, { ...ctx, duration: 0 });
        expect(state.phase).toBe('closed');
        expect(effects).toEqual([]);
    });
});

describe('lensWidthFor', () => {
    it('steps by eight pixels, so a live resize does not rebuild the track per pixel', () => {
        expect(lensWidthFor(1000, 1440, false)).toBe(600);
        expect(lensWidthFor(1003, 1440, false)).toBe(600);
        expect(lensWidthFor(0, 390, true)).toBe(368);
    });
});
