/** @jest-environment node */
import * as z from 'zod';
import { jsonSchemaOf } from '@/lib/cityCreatorJsonSchema';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';

type Node = Record<string, unknown>;

// The schema without the keywords that jsonSchemaOf may drop, so two schemas
// compare equal when they describe the same properties, required keys, enums
// and formats.
function withoutBounds(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(withoutBounds);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value as Node)
            .filter(([key]) => key !== 'pattern' && key !== 'minimum' && key !== 'maximum')
            .map(([key, child]) => [key, withoutBounds(child)]),
    );
}

function nodes(value: unknown): Node[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (value === null || typeof value !== 'object') return [];
    return [value as Node, ...Object.values(value as Node).flatMap(nodes)];
}

describe('jsonSchemaOf (City Creator prompt schema)', () => {
    const full = z.toJSONSchema(cityPopulationSchema, { io: 'input', unrepresentable: 'any' });
    const prompt = jsonSchemaOf(cityPopulationSchema);

    it('describes the same properties, required keys, enums and formats as the full schema', () => {
        const { $schema: _dialect, ...fullBody } = full;
        expect(withoutBounds(prompt)).toEqual(withoutBounds(fullBody));
    });

    it('drops the regex next to a format, the ±2^53-1 bounds and $schema', () => {
        const all = nodes(prompt);
        expect(prompt).not.toHaveProperty('$schema');
        expect(all.filter(node => node.format !== undefined && node.pattern !== undefined)).toEqual([]);
        expect(all.filter(node => Math.abs(Number(node.maximum ?? node.minimum ?? 0)) === Number.MAX_SAFE_INTEGER)).toEqual([]);
        expect(all.some(node => node.format === 'date')).toBe(true);
        expect(all.some(node => node.format === 'date-time')).toBe(true);
    });

    it('keeps the rules that tell the model something', () => {
        const all = nodes(prompt);
        expect(all.some(node => node.pattern === '^#[0-9a-fA-F]{6}$')).toBe(true);
        expect(all.some(node => node.type === 'integer' && node.minimum === 0)).toBe(true);
    });

    it('does not change the conversion of a schema with no such keywords', () => {
        const plain = z.object({ name: z.string().min(2), kind: z.enum(['a', 'b']) });
        const { $schema: _dialect, ...expected } = z.toJSONSchema(plain, { io: 'input' });
        expect(jsonSchemaOf(plain)).toEqual(expected);
    });
});
