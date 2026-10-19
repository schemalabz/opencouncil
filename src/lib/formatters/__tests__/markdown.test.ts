import { DESCRIPTION_PREVIEW_CHARS, previewDescription, stripMarkdown } from '../markdown';

describe('previewDescription', () => {
    it('returns a short description whole, as plain text', () => {
        const markdown = 'Συζήτηση για το [πάρκο](REF:UTTERANCE:u1) της **οδού** Α.';
        expect(previewDescription(markdown)).toEqual({ descriptionPreview: stripMarkdown(markdown), descriptionTruncated: false });
    });

    it('cuts a long description at a word boundary with an ellipsis', () => {
        const words = Array.from({ length: 80 }, (_, i) => `λέξη${i}`).join(' ');
        const { descriptionPreview: summary, descriptionTruncated: summaryTruncated } = previewDescription(words);
        expect(summaryTruncated).toBe(true);
        expect(summary.endsWith('…')).toBe(true);
        expect(summary.length).toBeLessThanOrEqual(DESCRIPTION_PREVIEW_CHARS + 1);
        // whole words only: the text before the ellipsis is a prefix of the source ending at a space
        const head = summary.slice(0, -1);
        expect(words.startsWith(head)).toBe(true);
        expect(words.charAt(head.length)).toBe(' ');
    });

    it('is whole at exactly the limit and cut one past it', () => {
        expect(previewDescription('α'.repeat(100), 100)).toEqual({ descriptionPreview: 'α'.repeat(100), descriptionTruncated: false });
        expect(previewDescription('α'.repeat(101), 100).descriptionTruncated).toBe(true);
    });

    it('keeps a word that ends exactly at the cut', () => {
        const text = `${'a'.repeat(13)} ${'b'.repeat(6)} ${'c'.repeat(30)}`;
        expect(previewDescription(text, 20).descriptionPreview).toBe(`${'a'.repeat(13)} ${'b'.repeat(6)}…`);
    });

    it('does not leave a dangling comma before the ellipsis', () => {
        const text = `${'α'.repeat(90)}, ${'β'.repeat(50)}`;
        expect(previewDescription(text, 100).descriptionPreview).toBe(`${'α'.repeat(90)}…`);
    });

    it('keeps a hard cut when the only word boundary sits too early', () => {
        const text = `αβ ${'γ'.repeat(400)}`;
        const { descriptionPreview: summary } = previewDescription(text, 100);
        expect(summary).toBe(`${text.slice(0, 100)}…`);
    });

    it('never cuts inside an emoji', () => {
        const text = `${'α'.repeat(99)}🎉${'β'.repeat(50)}`;
        const { descriptionPreview: summary } = previewDescription(text, 100);
        expect(summary).toBe(`${'α'.repeat(99)}🎉…`);
        expect(/[\uD800-\uDFFF]…$/u.test(summary)).toBe(false);
    });

    it('measures the limit on the stripped text, not the markdown', () => {
        // 60 chars of text once the link targets are gone, far more as markdown
        const markdown = Array.from({ length: 6 }, (_, i) => `[κείμενο${i}](REF:UTTERANCE:utterance-id-${i})`).join(' ');
        expect(previewDescription(markdown, 100).descriptionTruncated).toBe(false);
    });
});
