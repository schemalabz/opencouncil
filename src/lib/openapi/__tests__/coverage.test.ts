import { getOpenApiSpec } from '@/lib/openapi';

// The set of API operations we intend the generated OpenAPI spec to document.
// This is a deliberate snapshot: because the spec is generated only from
// registry.registerPath() calls, an endpoint whose registration is removed (or
// never written) silently disappears from the spec. This guard fails loudly in
// that case — as happened with GET /api/utterance/{utteranceId}/context, which
// existed in the hand-written spec but was dropped during the code-first migration.
//
// When you intentionally add or remove a documented endpoint, update this list.
const EXPECTED_OPERATIONS = [
    'GET /api/cities',
    'POST /api/cities',
    'GET /api/cities/all',
    'GET /api/cities/{cityId}',
    'PUT /api/cities/{cityId}',
    'DELETE /api/cities/{cityId}',
    'GET /api/cities/{cityId}/meetings',
    'POST /api/cities/{cityId}/meetings',
    'GET /api/cities/{cityId}/meetings/{meetingId}',
    'PUT /api/cities/{cityId}/meetings/{meetingId}',
    'GET /api/cities/{cityId}/parties',
    'POST /api/cities/{cityId}/parties',
    'GET /api/cities/{cityId}/parties/{partyId}',
    'PUT /api/cities/{cityId}/parties/{partyId}',
    'DELETE /api/cities/{cityId}/parties/{partyId}',
    'GET /api/cities/{cityId}/people',
    'POST /api/cities/{cityId}/people',
    'GET /api/cities/{cityId}/people/{personId}',
    'PUT /api/cities/{cityId}/people/{personId}',
    'DELETE /api/cities/{cityId}/people/{personId}',
    'POST /api/search',
    'GET /api/utterance/{utteranceId}/context',
].sort();

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function actualOperations(): string[] {
    const spec = getOpenApiSpec();
    const ops: string[] = [];
    for (const [path, item] of Object.entries(spec.paths ?? {})) {
        for (const method of Object.keys(item as Record<string, unknown>)) {
            if (HTTP_METHODS.includes(method)) ops.push(`${method.toUpperCase()} ${path}`);
        }
    }
    return ops.sort();
}

describe('OpenAPI coverage', () => {
    it('documents exactly the intended set of operations', () => {
        const actual = actualOperations();
        const missing = EXPECTED_OPERATIONS.filter((op) => !actual.includes(op));
        const unexpected = actual.filter((op) => !EXPECTED_OPERATIONS.includes(op));

        // `missing` catches a dropped/never-written registration (a silent doc loss).
        expect(missing).toEqual([]);
        // `unexpected` catches a new endpoint added without updating this snapshot.
        expect(unexpected).toEqual([]);
    });
});
