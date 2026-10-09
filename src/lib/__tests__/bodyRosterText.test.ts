/** @jest-environment node */

const mockAiChat = jest.fn();
jest.mock('server-only', () => ({}));
jest.mock('@/lib/ai', () => ({ aiChat: (...args: unknown[]) => mockAiChat(...args) }));

import { parseRosterText, RosterParseError } from '../bodyRosterText';

const context = { bodyName: 'Δημοτικό Συμβούλιο Νέων', cityName: 'Χανιά', language: 'el' };

beforeEach(() => jest.clearAllMocks());

describe('parseRosterText', () => {
    it('hands the model the list with the body and returns the entries the schema accepts', async () => {
        mockAiChat.mockResolvedValue({
            result: { entries: [
                { name: 'Μαρία Νεανίδη', name_en: 'Maria Neanidi', name_short: 'Μ. Νεανίδη', name_short_en: 'M. Neanidi', roleName: 'Πρόεδρος', roleName_en: 'Chair', isHead: true },
                { name: 'Γιώργος Νεαρός', name_en: 'Giorgos Nearos', name_short: 'Γ. Νεαρός', name_short_en: 'G. Nearos', roleName: '', roleName_en: null },
            ] },
            usage: {},
        });

        const entries = await parseRosterText('Πρόεδρος: Μαρία Νεανίδη\nΓιώργος Νεαρός', context);

        const [systemPrompt, userPrompt] = mockAiChat.mock.calls[0];
        expect(systemPrompt).toContain('JSON SCHEMA');
        expect(JSON.parse(userPrompt)).toEqual({ ...context, list: 'Πρόεδρος: Μαρία Νεανίδη\nΓιώργος Νεαρός' });
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ name: 'Μαρία Νεανίδη', roleName: 'Πρόεδρος', isHead: true });
        expect(entries[1]).toMatchObject({ roleName: null, roleName_en: null, isHead: false });
    });

    it('refuses an answer that does not match the schema', async () => {
        mockAiChat.mockResolvedValue({ result: { people: [{ name: 'x' }] }, usage: {} });
        await expect(parseRosterText('x', context)).rejects.toThrow(RosterParseError);
    });
});
