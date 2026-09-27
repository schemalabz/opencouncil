import { flattenUtterances, utteranceAt, splitCaptionChunks } from '../captionTimeline';

interface Span {
    id: string;
    text: string;
    startTimestamp: number;
    endTimestamp: number;
}

const u = (id: string, start: number, end: number, text = id): Span => ({
    id,
    text,
    startTimestamp: start,
    endTimestamp: end,
});

describe('flattenUtterances', () => {
    it('flattens every segment and sorts by start time', () => {
        expect(flattenUtterances([
            { utterances: [u('b', 10, 20)] },
            { utterances: [u('a', 0, 10), u('c', 20, 30)] },
        ])).toEqual([u('a', 0, 10), u('b', 10, 20), u('c', 20, 30)]);
    });

    it('returns an empty list for a transcript with no utterances', () => {
        expect(flattenUtterances([{ utterances: [] }])).toEqual([]);
    });
});

describe('utteranceAt', () => {
    const utterances = [u('a', 0, 10), u('b', 10, 20), u('c', 21, 30)];

    it('finds the utterance covering the given time', () => {
        expect(utteranceAt(utterances, 5)).toEqual(u('a', 0, 10));
        expect(utteranceAt(utterances, 15)).toEqual(u('b', 10, 20));
    });

    it('returns null between utterances, where nothing is being said', () => {
        expect(utteranceAt(utterances, 20.5)).toBeNull();
    });

    it('returns null before the first utterance and after the last', () => {
        expect(utteranceAt(utterances, -1)).toBeNull();
        expect(utteranceAt(utterances, 31)).toBeNull();
    });

    it('picks the later-starting utterance when two overlap, like an interjection', () => {
        const nested = [u('turn', 0, 30), u('interjection', 10, 15)];
        expect(utteranceAt(nested, 12)).toEqual(u('interjection', 10, 15));
        expect(utteranceAt(nested, 20)).toEqual(u('turn', 0, 30));
    });

    it('at a shared boundary, the utterance that starts there wins over the one that ends there', () => {
        expect(utteranceAt(utterances, 10)).toEqual(u('b', 10, 20));
    });
});

describe('splitCaptionChunks', () => {
    it('returns a single chunk spanning the whole utterance when the text is short', () => {
        const utterance = { text: 'a short remark', startTimestamp: 5, endTimestamp: 8 };
        expect(splitCaptionChunks(utterance)).toEqual([
            { text: 'a short remark', startTimestamp: 5, endTimestamp: 8 },
        ]);
    });

    it('returns nothing for an utterance with no words', () => {
        expect(splitCaptionChunks({ text: '   ', startTimestamp: 0, endTimestamp: 10 })).toEqual([]);
    });

    it('splits a long utterance into contiguous chunks that tile its span and preserve every word', () => {
        const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
        const utterance = { text: words.join(' '), startTimestamp: 0, endTimestamp: 40 };
        const chunks = splitCaptionChunks(utterance);

        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[0].startTimestamp).toBe(0);
        expect(chunks[chunks.length - 1].endTimestamp).toBe(40);
        for (let i = 0; i < chunks.length - 1; i++) {
            expect(chunks[i].endTimestamp).toBe(chunks[i + 1].startTimestamp);
        }
        expect(chunks.map(c => c.text).join(' ')).toBe(utterance.text);
    });

    it('picks the chunk covering a given time the same way utteranceAt picks an utterance', () => {
        const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
        const utterance = { text: words.join(' '), startTimestamp: 0, endTimestamp: 40 };
        const chunks = splitCaptionChunks(utterance);

        expect(utteranceAt(chunks, 0)).toBe(chunks[0]);
        expect(utteranceAt(chunks, 39.9)).toBe(chunks[chunks.length - 1]);
    });

    describe('with an interjection inside the utterance', () => {
        // Four 45-char words — any two together exceed MAX_CHUNK_CHARS, so
        // each lands in its own group — giving four equal quarter-shares
        // over [0, 40] with no gap. The interjection sits in the second quarter.
        const words = ['a'.repeat(45), 'b'.repeat(45), 'c'.repeat(45), 'd'.repeat(45)];
        const utterance = { text: words.join(' '), startTimestamp: 0, endTimestamp: 40 };
        const gap = { startTimestamp: 10, endTimestamp: 20 };

        it('pauses the chunk the interjection lands in, rather than skipping ahead once it resumes', () => {
            const chunks = splitCaptionChunks(utterance, [gap]);
            expect(chunks).toEqual([
                { text: words[0], startTimestamp: 0, endTimestamp: 7.5 },
                { text: words[1], startTimestamp: 7.5, endTimestamp: 25 },
                { text: words[2], startTimestamp: 25, endTimestamp: 32.5 },
                { text: words[3], startTimestamp: 32.5, endTimestamp: 40 },
            ]);
            // The same chunk is showing right before the interjection starts
            // and right after it ends — its words were never skipped.
            expect(utteranceAt(chunks, 9.9)).toBe(chunks[1]);
            expect(utteranceAt(chunks, 20)).toBe(chunks[1]);
        });

        it('still tiles the whole span and preserves every word', () => {
            const chunks = splitCaptionChunks(utterance, [gap]);
            expect(chunks[0].startTimestamp).toBe(0);
            expect(chunks[chunks.length - 1].endTimestamp).toBe(40);
            for (let i = 0; i < chunks.length - 1; i++) {
                expect(chunks[i].endTimestamp).toBe(chunks[i + 1].startTimestamp);
            }
            expect(chunks.map(c => c.text).join(' ')).toBe(utterance.text);
        });

        it('ignores a gap outside its own span', () => {
            const outside = { startTimestamp: 100, endTimestamp: 110 };
            expect(splitCaptionChunks(utterance, [outside])).toEqual(splitCaptionChunks(utterance));
        });

        it('falls back to the full span when a gap covers the whole utterance', () => {
            const covering = { startTimestamp: -5, endTimestamp: 45 };
            expect(splitCaptionChunks(utterance, [covering])).toEqual(splitCaptionChunks(utterance));
        });
    });
});
