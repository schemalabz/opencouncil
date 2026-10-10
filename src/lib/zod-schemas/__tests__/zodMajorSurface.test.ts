/** @jest-environment node */
// The zod behaviour that this repo depends on, across a major version bump.
// Every assertion is a behaviour that a user or an API client sees.
import type { ZodError } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { handleApiError } from '@/lib/api/errors';
import { partyFormSchema } from '@/lib/zod-schemas/party';
import { meetingSchema } from '@/lib/zod-schemas/meeting';
import { updateProfileSchema } from '@/lib/zod-schemas/user';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';
import { jsonSchemaOf } from '@/lib/openapi/jsonSchema';

const rhfOptions = { fields: {}, shouldUseNativeValidation: false } as const;

describe('zod surface used by this repo', () => {
    it('PartyForm: the resolver returns field errors with our messages instead of throwing', async () => {
        const result = await zodResolver(partyFormSchema)(
            { name: 'a', name_en: 'ab', name_short: 'ab', name_short_en: 'ab', colorHex: '#123456' },
            undefined,
            rhfOptions,
        );
        expect(result.errors).toMatchObject({ name: { message: 'Party name must be at least 2 characters.' } });
    });

    it('handleApiError turns a ZodError into a 400 with the issue messages', async () => {
        const parsed = meetingSchema.safeParse({ name: 'a', name_en: 'ab', date: '2026-01-01' });
        const response = handleApiError(parsed.error as ZodError);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Meeting name must be at least 2 characters.' });
    });

    it('API routes: `error.issues` is the issue list that the 400 body carries', () => {
        // The API routes return NextResponse.json({ error: error.issues }) on ZodError.
        const parsed = meetingSchema.safeParse({ name: 'a', name_en: 'ab', date: '2026-01-01' });
        const body = JSON.parse(JSON.stringify({ error: parsed.error?.issues }));
        expect(body.error).toEqual([expect.objectContaining({ path: ['name'], message: 'Meeting name must be at least 2 characters.' })]);
    });

    it('meetingSchema: processAgenda defaults to false', () => {
        const parsed = meetingSchema.parse({ name: 'ab', name_en: 'ab', date: '2026-01-01' });
        expect(parsed.processAgenda).toBe(false);
    });

    it('City Creator prompt: jsonSchemaOf describes the city population payload', () => {
        const schema = jsonSchemaOf(cityPopulationSchema);
        expect(Object.keys((schema as { properties?: object }).properties ?? {})).toEqual(
            expect.arrayContaining(['parties', 'people', 'administrativeBodies']),
        );
    });

    it('profile phone: a rejected number surfaces the translation code as the message', () => {
        const parsed = updateProfileSchema.safeParse({ phone: '123' });
        expect(parsed.success).toBe(false);
        expect(parsed.error?.issues[0].message).toMatch(/^[a-zA-Z_.]+$/);
        // src/app/api/profile/route.ts:21 sends flatten(); profile-api.ts:25 reads fieldErrors.phone[0].
        expect(parsed.error?.flatten().fieldErrors.phone?.[0]).toBe(parsed.error?.issues[0].message);
    });
});
