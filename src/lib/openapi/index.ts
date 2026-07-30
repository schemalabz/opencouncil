// Import route registrations — each file calls registry.registerPath() on import.
// Add new route files here as they are migrated.
import './routes/cities';
import './routes/meetings';
import './routes/search';
import './routes/parties';
import './routes/people';

import { registry, generateSpec } from './registry';
import type { OpenApiSpec } from '@/lib/utils/openapi';

export { registry, generateSpec };

// The spec is fully derived from the Zod registry, so it's stable for the
// lifetime of the process — generate it once and reuse. Consumers filter a
// fresh copy per request (filterSpecByAccessLevel never mutates its input).
let cachedSpec: OpenApiSpec | undefined;

export function getOpenApiSpec(): OpenApiSpec {
    cachedSpec ??= generateSpec() as unknown as OpenApiSpec;
    return cachedSpec;
}
