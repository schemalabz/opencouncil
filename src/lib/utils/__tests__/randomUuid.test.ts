import { randomUuid } from '../randomUuid';
import { searchIdSchema } from '@/lib/zod-schemas/search';

describe('randomUuid', () => {
    it('gives a UUID that the search accepts as its id', () => {
        expect(searchIdSchema.safeParse(randomUuid()).success).toBe(true);
    });

    // A page over plain HTTP on the LAN has no crypto.randomUUID.
    it('gives one too where crypto.randomUUID is missing', () => {
        const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
        Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
        try {
            const ids = Array.from({ length: 50 }, () => randomUuid());
            expect(ids.every((id) => searchIdSchema.safeParse(id).success)).toBe(true);
            expect(new Set(ids).size).toBe(50);
        } finally {
            if (original) Object.defineProperty(crypto, 'randomUUID', original);
            else delete (crypto as { randomUUID?: unknown }).randomUUID;
        }
    });
});
