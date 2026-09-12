import { buildPrompt, SYSTEM_PROMPT } from '../prompt';

describe('buildPrompt', () => {
    it('joins the trimmed title and description as the user message', () => {
        const prompt = buildPrompt({ title: '  Βλάβη αποχετευτικού  ', description: 'Ο αγωγός έσπασε.\n' });
        expect(prompt).toBe('Βλάβη αποχετευτικού\n\nΟ αγωγός έσπασε.');
    });

    it('leaves out an empty description', () => {
        expect(buildPrompt({ title: 'Τίτλος', description: '   ' })).toBe('Τίτλος');
    });

    it('keeps the style rules out of the user message', () => {
        const prompt = buildPrompt({ title: 'a', description: 'b' });
        expect(prompt).not.toContain('pixel art');
        expect(SYSTEM_PROMPT).toContain('pixel art');
    });
});
