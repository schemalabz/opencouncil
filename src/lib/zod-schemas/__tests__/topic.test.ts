import { createTopicSchema, updateTopicSchema } from '../topic';

const validTopic = {
    name: 'Περιβάλλον',
    name_en: 'Environment',
    colorHex: '#4f46e5',
    description: 'Topics related to the environment',
};

describe('createTopicSchema', () => {
    it('should validate a complete topic', () => {
        const parsed = createTopicSchema.parse(validTopic);
        expect(parsed.name).toBe('Περιβάλλον');
        expect(parsed.name_en).toBe('Environment');
        expect(parsed.colorHex).toBe('#4f46e5');
        expect(parsed.description).toBe('Topics related to the environment');
    });

    it('should trim name and name_en', () => {
        const parsed = createTopicSchema.parse({
            ...validTopic,
            name: '  Περιβάλλον  ',
            name_en: '  Environment  ',
        });
        expect(parsed.name).toBe('Περιβάλλον');
        expect(parsed.name_en).toBe('Environment');
    });

    it('should reject empty name after trimming', () => {
        expect(() => createTopicSchema.parse({
            ...validTopic,
            name: '   ',
        })).toThrow();
    });

    it('should reject empty name_en after trimming', () => {
        expect(() => createTopicSchema.parse({
            ...validTopic,
            name_en: '   ',
        })).toThrow();
    });

    it('should reject missing required fields', () => {
        expect(() => createTopicSchema.parse({ name: 'Test' })).toThrow();
    });

    it('should validate hex color format', () => {
        expect(() => createTopicSchema.parse({
            ...validTopic,
            colorHex: 'not-a-color',
        })).toThrow();
    });

    it('should accept 3-character hex colors', () => {
        const parsed = createTopicSchema.parse({
            ...validTopic,
            colorHex: '#abc',
        });
        expect(parsed.colorHex).toBe('#abc');
    });

    it('should reject hex without # prefix', () => {
        expect(() => createTopicSchema.parse({
            ...validTopic,
            colorHex: '4f46e5',
        })).toThrow();
    });

    it('should coerce null/undefined icon to null', () => {
        expect(createTopicSchema.parse(validTopic).icon).toBeNull();
        expect(createTopicSchema.parse({ ...validTopic, icon: null }).icon).toBeNull();
        expect(createTopicSchema.parse({ ...validTopic, icon: '' }).icon).toBeNull();
    });

    it('should keep valid icon string', () => {
        const parsed = createTopicSchema.parse({ ...validTopic, icon: 'Trees' });
        expect(parsed.icon).toBe('Trees');
    });

    it('should default deprecated to false', () => {
        expect(createTopicSchema.parse(validTopic).deprecated).toBe(false);
    });

    it('should accept explicit deprecated value', () => {
        const parsed = createTopicSchema.parse({ ...validTopic, deprecated: true });
        expect(parsed.deprecated).toBe(true);
    });

    it('should reject non-boolean deprecated', () => {
        expect(() => createTopicSchema.parse({
            ...validTopic,
            deprecated: 'yes',
        })).toThrow();
    });

    it('should reject non-string description', () => {
        expect(() => createTopicSchema.parse({
            ...validTopic,
            description: 123,
        })).toThrow();
    });
});

describe('updateTopicSchema', () => {
    it('should allow all fields to be optional', () => {
        const parsed = updateTopicSchema.parse({});
        expect(parsed).toEqual({});
    });

    it('should leave unprovided fields as undefined', () => {
        const parsed = updateTopicSchema.parse({ name: 'Updated' });
        expect(parsed.name).toBe('Updated');
        expect(parsed.name_en).toBeUndefined();
        expect(parsed.colorHex).toBeUndefined();
        expect(parsed.description).toBeUndefined();
        expect(parsed.deprecated).toBeUndefined();
    });

    it('should validate provided fields', () => {
        expect(() => updateTopicSchema.parse({
            colorHex: 'invalid',
        })).toThrow();
    });

    it('should trim provided name', () => {
        const parsed = updateTopicSchema.parse({ name: '  Updated  ' });
        expect(parsed.name).toBe('Updated');
    });

    it('should reject empty name after trimming', () => {
        expect(() => updateTopicSchema.parse({ name: '   ' })).toThrow();
    });

    it('should accept partial updates with valid data', () => {
        const parsed = updateTopicSchema.parse({
            description: 'New description',
            deprecated: true,
        });
        expect(parsed.description).toBe('New description');
        expect(parsed.deprecated).toBe(true);
        expect(parsed.name).toBeUndefined();
    });
});
