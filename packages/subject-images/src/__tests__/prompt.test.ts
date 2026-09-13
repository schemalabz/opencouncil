import { buildPrompt, SYSTEM_PROMPT } from '../prompt';

const place = { city: 'Athens', country: 'Greece' };

describe('buildPrompt', () => {
    it('names the place, then joins the trimmed title and description as the user message', () => {
        const prompt = buildPrompt({ ...place, title: '  Βλάβη αποχετευτικού  ', description: 'Ο αγωγός έσπασε.\n' });
        expect(prompt).toBe('Athens, Greece\n\nΒλάβη αποχετευτικού\n\nΟ αγωγός έσπασε.');
    });

    it('leaves out an empty description', () => {
        expect(buildPrompt({ ...place, title: 'Τίτλος', description: '   ' })).toBe('Athens, Greece\n\nΤίτλος');
    });

    it('sets the scene in the city of the message, not in one city for every town', () => {
        expect(buildPrompt({ city: 'Lyon', country: 'France', title: 'a', description: 'b' })).toMatch(/^Lyon, France\n/);
        expect(SYSTEM_PROMPT).toContain('the city named in the message');
        expect(SYSTEM_PROMPT).not.toMatch(/set in everyday Athens/);
    });

    it('keeps the style rules out of the user message', () => {
        const prompt = buildPrompt({ ...place, title: 'a', description: 'b' });
        expect(prompt).not.toContain('pixel art');
        expect(SYSTEM_PROMPT).toContain('pixel art');
    });
});
