/** @jest-environment node */
import { updateCityFormDataSchema } from '@/lib/zod-schemas/city';
import { updateTopicSchema } from '@/lib/zod-schemas/topic';
import { updateAdminUserSchema, updateProfileSchema } from '@/lib/zod-schemas/user';

// A partial update writes only the fields the request sends. Under .partial(),
// a field written with .default() (or .prefault()) would fill in its default
// for a missing key, and the update would reset that column: a name-only topic
// PUT would set deprecated back to false.
describe('partial update schemas leave omitted fields absent', () => {
    it('topic', () => {
        expect(updateTopicSchema.parse({ name: 'Πολεοδομία' })).toEqual({ name: 'Πολεοδομία' });
        expect(updateTopicSchema.parse({})).toEqual({});
    });

    it('city form data', () => {
        expect(updateCityFormDataSchema.parse({})).toEqual({});
    });

    it('profile', () => {
        expect(updateProfileSchema.parse({})).toEqual({});
    });

    it('admin user', () => {
        expect(updateAdminUserSchema.parse({ id: 'user-1' })).toEqual({ id: 'user-1' });
    });
});
