import {
    PETITION_DISPLAY_THRESHOLD,
    buildPetitionedCities,
    petitionBucket,
    petitionFill,
    petitionIntensities,
} from './petitions';

/* --- WCAG contrast machinery, so the ramp's text switch is pinned by measurement ------------ */

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
};

/** Resolve petitionFill's color-mix(in srgb, deep PCT%, pale) to rgb. */
const rampBackground = (pct: number): [number, number, number] => {
    const deep = hslToRgb(212, 55, 38);
    const pale = hslToRgb(212, 60, 90);
    return [0, 1, 2].map((i) => (deep[i] * pct + pale[i] * (100 - pct)) / 100) as [number, number, number];
};

const luminance = ([r, g, b]: [number, number, number]) => {
    const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrast = (a: [number, number, number], b: [number, number, number]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe('petitionBucket', () => {
    it('hides counts below the display threshold', () => {
        expect(petitionBucket(0)).toBeNull();
        expect(petitionBucket(9)).toBeNull();
    });

    it('maps counts to their coarse public bucket', () => {
        expect(petitionBucket(10)).toBe(10);
        expect(petitionBucket(24)).toBe(10);
        expect(petitionBucket(25)).toBe(25);
        expect(petitionBucket(49)).toBe(25);
        expect(petitionBucket(50)).toBe(50);
        expect(petitionBucket(99)).toBe(50);
        expect(petitionBucket(100)).toBe(100);
        expect(petitionBucket(5000)).toBe(100);
    });
});

describe('petitionIntensities', () => {
    it('spreads a long-tailed distribution across the ramp on a log scale', () => {
        const [a, b, c] = petitionIntensities([10, 100, 1000]);
        expect(a).toBe(0); // at the threshold — bottom of the ramp
        expect(c).toBe(1); // the max — top of the ramp
        expect(b).toBeCloseTo(0.5, 5); // log-middle, not linear-middle (which would be ~0.09)
    });

    it('gives a lone displayed municipality the full colour', () => {
        expect(petitionIntensities([PETITION_DISPLAY_THRESHOLD])).toEqual([1]);
    });

    it('clamps to the 0..1 ramp', () => {
        for (const v of petitionIntensities([10, 17, 300, 42])) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
        }
    });

    it('is strictly monotone in the count, so the ramp always agrees with the ranking', () => {
        // Full precision is deliberate: quantisation once made ordinals contradict the badges —
        // see the "deliberately NOT an invariant" note in petitions.ts.
        const counts = [10, 11, 13, 17, 23, 42, 137, 300];
        const vals = petitionIntensities(counts);
        for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    });

    it('handles an empty input', () => {
        expect(petitionIntensities([])).toEqual([]);
    });
});

describe('buildPetitionedCities', () => {
    const row = {
        id: 'x',
        name: 'Χ',
        name_municipality: 'Δήμος Χ',
        logoImage: null,
        lng: 23.7,
        lat: 38.0,
        geometry: '{"type":"Point","coordinates":[23.7,38.0]}',
        petitions: 26,
    };

    it('ships exactly the declared public fields — the privacy surface, pinned', () => {
        // A widened SELECT (or a future `...r` spread) must not silently ship more. This is the
        // direct encoding of the "petitioner data never leaves the server" invariant.
        const leakyRow = { ...row, userId: 'u1', email: 'a@b.c' } as typeof row;
        const [out] = buildPetitionedCities([leakyRow]);
        expect(Object.keys(out).sort()).toEqual([
            'bucket',
            'geometry',
            'id',
            'intensity',
            'lat',
            'lng',
            'logoImage',
            'name',
            'nameMunicipality',
        ]);
    });

    it('never forwards the raw count — only its bucket and ramp position', () => {
        const [out] = buildPetitionedCities([row]);
        expect(out.bucket).toBe(25);
        expect(JSON.stringify(out)).not.toContain('26');
    });

    it('keeps a boundary-less δήμος, with null coordinates (leaderboard-only)', () => {
        const [out] = buildPetitionedCities([{ ...row, lng: null, lat: null, geometry: null }]);
        expect(out).toMatchObject({ id: 'x', lng: null, lat: null, geometry: null, bucket: 25 });
    });

    it('preserves the input (server ranking) order', () => {
        const out = buildPetitionedCities([
            { ...row, id: 'first', petitions: 1000 },
            { ...row, id: 'second', petitions: 12 },
        ]);
        expect(out.map((c) => c.id)).toEqual(['first', 'second']);
    });
});

describe('petitionFill', () => {
    it('meets WCAG AA (4.5:1 — the badges are 12px text) across the whole ramp', () => {
        const white: [number, number, number] = [255, 255, 255];
        const black: [number, number, number] = [0, 0, 0];
        for (let intensity = 0; intensity <= 1.0001; intensity += 0.1) {
            const { text } = petitionFill(intensity);
            const pct = Math.round(25 + 75 * intensity);
            const bg = rampBackground(pct);
            const fg = text === '#ffffff' ? white : black;
            const ratio = contrast(fg, bg);
            expect({ intensity: Math.round(intensity * 10) / 10, text, ratio, passes: ratio >= 4.5 }).toMatchObject({
                passes: true,
            });
        }
    });
});
