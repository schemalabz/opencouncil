/** @jest-environment node */
// In a Next server process the module cache is shared, so a route that loads
// a shared zod schema can run before the first import of the OpenAPI registry.
// zod 4 adds .openapi() only to a schema created after extendZodWithOpenApi(z).
// The spec must still build in that order.
import { meetingSchema } from '@/lib/zod-schemas/meeting';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';
import { searchRequestSchema } from '@/lib/zod-schemas/search';
import { getOpenApiSpec } from '@/lib/openapi';

it('builds the spec when the shared schemas load before the registry', () => {
    expect([meetingSchema, cityPopulationSchema, searchRequestSchema].every(Boolean)).toBe(true);
    expect(Object.keys(getOpenApiSpec().paths ?? {}).length).toBeGreaterThan(0);
});
