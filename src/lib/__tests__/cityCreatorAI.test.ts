import { cityPopulationJsonSchema } from '../cityCreatorAI';

jest.mock('../ai', () => ({ aiChat: jest.fn() }));

describe('cityPopulationJsonSchema', () => {
    it('gives the model the role fields of the city import', () => {
        const schema = cityPopulationJsonSchema();
        const role = JSON.stringify(schema);
        for (const field of ['partyName', 'administrativeBodyName', 'isHead', 'colorHex']) {
            expect(role).toContain(`"${field}"`);
        }
        expect(role).toContain('^#[0-9a-fA-F]{6}$');
    });
});
