import {
    createAdminUserSchema,
    updateAdminUserSchema,
} from '../user';

describe('createAdminUserSchema', () => {
    const validBase = {
        email: 'test@example.com',
        name: 'Test User',
        isSuperAdmin: false,
    };

    it('should accept flat cityId in administers', () => {
        const result = createAdminUserSchema.safeParse({
            ...validBase,
            administers: [{ cityId: 'abc123' }],
        });
        expect(result.success).toBe(true);
    });

    it('should accept flat partyId in administers', () => {
        const result = createAdminUserSchema.safeParse({
            ...validBase,
            administers: [{ partyId: 'party-id' }],
        });
        expect(result.success).toBe(true);
    });

    it('should accept flat personId in administers', () => {
        const result = createAdminUserSchema.safeParse({
            ...validBase,
            administers: [{ personId: 'person-id' }],
        });
        expect(result.success).toBe(true);
    });

    it('should reject Prisma relation syntax { city: { connect: { id } } }', () => {
        const result = createAdminUserSchema.safeParse({
            ...validBase,
            administers: [{ city: { connect: { id: 'abc123' } } }],
        });
        // The refine requires exactly one of cityId/partyId/personId to be truthy.
        // None are set, so this must fail.
        expect(result.success).toBe(false);
    });

    it('should reject an administers entry with no IDs', () => {
        const result = createAdminUserSchema.safeParse({
            ...validBase,
            administers: [{}],
        });
        expect(result.success).toBe(false);
    });

    it('should reject an administers entry with multiple IDs', () => {
        const result = createAdminUserSchema.safeParse({
            ...validBase,
            administers: [{ cityId: 'abc', partyId: 'xyz' }],
        });
        expect(result.success).toBe(false);
    });

    it('should accept no administers field', () => {
        const result = createAdminUserSchema.safeParse(validBase);
        expect(result.success).toBe(true);
    });

    it('should accept empty administers array', () => {
        const result = createAdminUserSchema.safeParse({ ...validBase, administers: [] });
        expect(result.success).toBe(true);
    });
});

describe('updateAdminUserSchema', () => {
    it('should require id', () => {
        const result = updateAdminUserSchema.safeParse({ email: 'x@example.com' });
        expect(result.success).toBe(false);
    });

    it('should accept flat cityId in administers', () => {
        const result = updateAdminUserSchema.safeParse({
            id: 'user-1',
            administers: [{ cityId: 'abc123' }],
        });
        expect(result.success).toBe(true);
    });

    it('should reject Prisma relation syntax in administers', () => {
        const result = updateAdminUserSchema.safeParse({
            id: 'user-1',
            administers: [{ city: { connect: { id: 'abc123' } } }],
        });
        expect(result.success).toBe(false);
    });

    it('should accept partial update without administers', () => {
        const result = updateAdminUserSchema.safeParse({
            id: 'user-1',
            name: 'New Name',
        });
        expect(result.success).toBe(true);
    });
});
