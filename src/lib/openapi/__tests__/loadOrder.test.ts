/** @jest-environment node */
// In a Next server process the module cache is shared, so a route can load
// a shared zod schema before anything imports the OpenAPI module. The spec
// reads zod's own metadata and patches no prototype, so it must build in
// that order, and it must not change the shared schemas it documents.
import * as z from 'zod';
import { meetingSchema } from '@/lib/zod-schemas/meeting';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';
import { searchRequestSchema } from '@/lib/zod-schemas/search';
import { getOpenApiSpec } from '@/lib/openapi';

type SchemaObject = { properties?: Record<string, unknown> };

it('builds the spec when the shared schemas load before it', () => {
    const schemas = getOpenApiSpec().components?.schemas as Record<string, SchemaObject>;

    expect(Object.keys(schemas.CreateMeeting.properties ?? {})).toEqual(Object.keys(meetingSchema.shape));
    expect(Object.keys(schemas.CityPopulation.properties ?? {})).toEqual(Object.keys(cityPopulationSchema.shape));
    expect(Object.keys(schemas.SearchRequest.properties ?? {})).toEqual(Object.keys(searchRequestSchema.shape));
});

it('leaves the shared schemas without a component id', () => {
    getOpenApiSpec();
    for (const schema of [meetingSchema, cityPopulationSchema, searchRequestSchema]) {
        expect(z.globalRegistry.get(schema)?.id).toBeUndefined();
    }
});
