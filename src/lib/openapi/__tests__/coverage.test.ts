import { getOpenApiSpec } from '@/lib/openapi';
import { filterSpecByAccessLevel, type OpenApiSpec } from '@/lib/utils/openapi';

// The set of API operations we intend the generated OpenAPI spec to document.
// This is a deliberate snapshot: because the spec is generated only from
// the paths that the route files export, an endpoint whose entry is removed
// (or never written) silently disappears from the spec. This guard fails loudly in
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
    'POST /api/cities/{cityId}/populate',
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
    'GET /api/cities/{cityId}/subjects',
    'GET /api/cities/{cityId}/meetings/{meetingId}/subjects',
    'GET /api/cities/{cityId}/meetings/{meetingId}/subjects/{subjectId}',
    'PATCH /api/cities/{cityId}/meetings/{meetingId}/subjects/{subjectId}',
    'POST /api/search',
    'GET /api/utterance/{utteranceId}/context',
    'POST /api/cities/{cityId}/administrative-bodies',
    'PUT /api/cities/{cityId}/administrative-bodies/{bodyId}',
    'PUT /api/cities/{cityId}/meetings/{meetingId}/decisions',
    'POST /api/cities/{cityId}/meetings/{meetingId}/decisions',
    'POST /api/cities/{cityId}/roles/elected-order',
    'POST /api/profile',
    'POST /api/revalidate',
    'POST /api/admin/api-keys',
    'POST /api/admin/product-updates/send',
    'POST /api/admin/topics',
    'PUT /api/admin/topics/{topicId}',
    'POST /api/admin/users',
    'PUT /api/admin/users',
].sort();

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function actualOperations(spec: OpenApiSpec = getOpenApiSpec()): string[] {
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

    it('shows each viewer only the operations of its access level', () => {
        const spec = getOpenApiSpec();
        const publicOps = actualOperations(filterSpecByAccessLevel(spec, 'public'));
        const userOps = actualOperations(filterSpecByAccessLevel(spec, 'user'));
        const adminOps = actualOperations(filterSpecByAccessLevel(spec, 'admin'));

        expect(publicOps).not.toContain('POST /api/profile');
        expect(userOps).toContain('POST /api/profile');
        expect(adminOps).toContain('POST /api/cities/{cityId}/administrative-bodies');
        expect(adminOps).not.toContain('POST /api/admin/api-keys');
        expect(adminOps).not.toContain('POST /api/revalidate');
        expect(actualOperations(filterSpecByAccessLevel(spec, 'superadmin'))).toEqual(EXPECTED_OPERATIONS);

        // The request schemas of a hidden operation are hidden too.
        const publicSchemas = Object.keys(filterSpecByAccessLevel(spec, 'public').components?.schemas ?? {});
        expect(publicSchemas.filter(name => ['CreateApiKey', 'UpdateProfile', 'DecisionAction', 'AdministrativeBodyRequest'].includes(name)))
            .toEqual([]);
    });
});
