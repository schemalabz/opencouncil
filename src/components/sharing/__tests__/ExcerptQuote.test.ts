import { excerptQuoteText } from '../ExcerptQuote';
import type { ExcerptRun } from '@/lib/sharing/excerptSelector';

const labels = { unknownSpeaker: 'Unknown speaker', unverified: 'unverified' };
const run = (id: string, personId: string | null, speakerName: string | null, speakerUnverified?: boolean): ExcerptRun =>
    ({ id, text: `text ${id}`, speakerTagId: `tag-${personId}`, personId, speakerName, speakerUnverified });

describe('excerptQuoteText', () => {
    it('labels the name of an unverified speaker in the copied text', () => {
        expect(excerptQuoteText([run('1', 'anna', 'Anna', true), run('2', 'anna', 'Anna', true)], labels))
            .toBe('«text 1 text 2»\n— Anna (unverified)');
    });

    it('keeps a verified name without the label', () => {
        expect(excerptQuoteText([run('1', 'anna', 'Anna', false)], labels)).toBe('«text 1»\n— Anna');
    });

    it('names an unknown speaker without the label', () => {
        expect(excerptQuoteText([run('1', null, null, true)], labels)).toBe('«text 1»\n— Unknown speaker');
    });
});
