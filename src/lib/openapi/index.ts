import { generateDocument, mergePaths } from './registry';
import { adminPaths } from './routes/admin';
import { administrativeBodiesPaths } from './routes/administrativeBodies';
import { citiesPaths } from './routes/cities';
import { cityPopulationPaths } from './routes/cityPopulation';
import { decisionsPaths } from './routes/decisions';
import { meetingsPaths } from './routes/meetings';
import { partiesPaths } from './routes/parties';
import { peoplePaths } from './routes/people';
import { profilePaths } from './routes/profile';
import { rolesPaths } from './routes/roles';
import { searchPaths } from './routes/search';
import { subjectsPaths } from './routes/subjects';
import { utterancesPaths } from './routes/utterances';
import type { OpenApiSpec } from '@/lib/utils/openapi';

/** Every documented operation, with the zod schemas of its request and responses. */
export const paths = mergePaths(
    citiesPaths,
    cityPopulationPaths,
    meetingsPaths,
    searchPaths,
    partiesPaths,
    peoplePaths,
    subjectsPaths,
    utterancesPaths,
    administrativeBodiesPaths,
    decisionsPaths,
    rolesPaths,
    profilePaths,
    adminPaths,
);

export function generateSpec(): OpenApiSpec {
    // OpenApiSpec is the loose shape that filterSpecByAccessLevel walks; the
    // typed OpenAPIObject has no index signatures, so it does not convert directly.
    return generateDocument(paths) as unknown as OpenApiSpec;
}

// The spec is fully derived from the Zod schemas, so it's stable for the
// lifetime of the process — generate it once and reuse. Consumers filter a
// fresh copy per request (filterSpecByAccessLevel never mutates its input).
let cachedSpec: OpenApiSpec | undefined;

export function getOpenApiSpec(): OpenApiSpec {
    cachedSpec ??= generateSpec();
    return cachedSpec;
}
