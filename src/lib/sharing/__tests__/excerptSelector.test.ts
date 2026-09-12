import { createHash } from 'crypto';
import { MAX_EXCERPT_LENGTH, canonicalExcerpt, digestExcerpt, excerptPath, parseExcerptSelector, selectExcerptRuns, serializeExcerptSelector, transcriptExcerptPath, type ExcerptRun, type ExcerptSelector } from '../excerptSelector';
import { localizeText } from '@/lib/serbian';

const run: ExcerptRun = { id: 'u1', text: 'Λέμε ναι 🌳 στην πλατεία.', speakerTagId: 'tag', personId: 'person', speakerName: 'Άννα' };
const selector: ExcerptSelector = { cityId: 'athens', meetingId: 'sep10_2026', firstUtteranceId: 'u1', lastUtteranceId: 'u1', textLocale: 'el', digest: 'a'.repeat(64) };

describe('source-backed excerpt selectors', () => {
    it('round-trips the display filter while keeping old links valid', () => {
        for (const maxDrift of [0, 100, 500]) {
            const filtered = { ...selector, maxDrift };
            expect(parseExcerptSelector(serializeExcerptSelector(filtered))).toEqual(filtered);
            expect(transcriptExcerptPath(filtered, 0)).toContain(`maxDrift=${maxDrift}`);
        }
        for (const value of ['-1', '501', 'Infinity', '1.5', '']) {
            const query = serializeExcerptSelector(selector); query.set('maxDrift', value);
            expect(parseExcerptSelector(query)).toBeNull();
        }
        const repeated = serializeExcerptSelector({ ...selector, maxDrift: 0 }); repeated.append('maxDrift', '500');
        expect(parseExcerptSelector(repeated)).toBeNull();
        expect(parseExcerptSelector(serializeExcerptSelector(selector))).not.toHaveProperty('maxDrift');
    });
    it('round-trips only its own fields and rejects ambiguous, fractional and unsupported inputs', () => {
        expect(parseExcerptSelector(serializeExcerptSelector(selector))).toEqual(selector);
        for (const [key, value] of [['startOffset', '-1'], ['endOffset', '1.2'], ['textLocale', 'de'], ['digest', 'forged'], ['firstUtteranceId', 'a/b']]) {
            const query = serializeExcerptSelector(selector); query.set(key, value);
            expect(parseExcerptSelector(query)).toBeNull();
        }
        const repeated = serializeExcerptSelector(selector); repeated.append('firstUtteranceId', 'u2');
        expect(parseExcerptSelector(repeated)).toBeNull();
        expect(parseExcerptSelector({ ...Object.fromEntries(serializeExcerptSelector(selector)), cityId: ['a', 'b'] })).toBeNull();
    });

    it('preserves complete Greek text, punctuation and emoji', () => {
        expect(selectExcerptRuns([run])?.[0].text).toBe(run.text);
    });

    it('bounds utterances and text without silently truncating complete passages', () => {
        expect(selectExcerptRuns([{ ...run, text: 'x'.repeat(5000) }])).not.toBeNull();
        expect(selectExcerptRuns([{ ...run, text: 'x'.repeat(MAX_EXCERPT_LENGTH) }])).not.toBeNull();
        expect(selectExcerptRuns([{ ...run, text: 'x'.repeat(MAX_EXCERPT_LENGTH + 1) }])).toBeNull();
        expect(selectExcerptRuns(Array.from({ length: 41 }, (_, i) => ({ ...run, id: `u${i}`, text: 'x' })))).toBeNull();
        expect(selectExcerptRuns([{ ...run, text: '   ' }])).toBeNull();
    });

    it('rejects all legacy offset URLs instead of expanding old partial quotes', () => {
        for (const key of ['startOffset', 'endOffset']) {
            const query = serializeExcerptSelector(selector); query.set(key, '0');
            expect(parseExcerptSelector(query)).toBeNull();
            expect(parseExcerptSelector(Object.fromEntries(query))).toBeNull();
        }
        expect([...serializeExcerptSelector(selector).keys()]).not.toContain('startOffset');
        expect([...serializeExcerptSelector(selector).keys()]).not.toContain('endOffset');
        expect(JSON.parse(canonicalExcerpt([run]))[0]).toBe(2);
    });

    it('hashes the same explicit data in browser and server, including attribution', async () => {
        const original = await digestExcerpt([run]);
        expect(original).toBe(createHash('sha256').update(canonicalExcerpt([run])).digest('hex'));
        expect(await digestExcerpt([{ ...run, speakerName: 'Νίκος' }])).not.toBe(original);
        expect(await digestExcerpt([{ ...run, text: 'Διαφωνώ.' }])).not.toBe(original);
    });

    it('uses complete transformed Serbian text and keeps source locale after a UI locale switch', () => {
        const latinText = localizeText('Љиљана', 'sr-Latn');
        expect(latinText).toBe('Ljiljana');
        expect(selectExcerptRuns([{ ...run, text: latinText }])?.[0].text).toBe('Ljiljana');
        const latin = { ...selector, textLocale: 'sr-Latn' as const };
        expect(excerptPath(latin, 'en')).toMatch(/^\/en\/share\/excerpt/);
        expect(transcriptExcerptPath(latin, 0)).toMatch(/^\/lat\/athens\/sep10_2026\/transcript\?/);
        expect(transcriptExcerptPath(latin, 0)).toContain('&t=0');
        expect(excerptPath(selector)).not.toBe(excerptPath({ ...selector, lastUtteranceId: 'u2' }));
    });
});
