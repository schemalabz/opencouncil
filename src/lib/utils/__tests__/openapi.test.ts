import {
  getUserAccessLevel,
  filterSpecByAccessLevel,
  ACCESS_LEVEL_ORDER,
  type OpenApiSpec,
} from '../openapi';

describe('getUserAccessLevel', () => {
  it('returns "public" for an anonymous (null) user', () => {
    expect(getUserAccessLevel(null)).toBe('public');
  });

  it('returns "superadmin" when isSuperAdmin, regardless of administers', () => {
    expect(getUserAccessLevel({ isSuperAdmin: true })).toBe('superadmin');
    expect(getUserAccessLevel({ isSuperAdmin: true, administers: [] })).toBe('superadmin');
  });

  it('returns "admin" for a non-super user who administers something', () => {
    expect(getUserAccessLevel({ isSuperAdmin: false, administers: [{}] })).toBe('admin');
  });

  it('returns "user" for a non-super user with no administers (including when omitted)', () => {
    expect(getUserAccessLevel({ isSuperAdmin: false, administers: [] })).toBe('user');
    expect(getUserAccessLevel({ isSuperAdmin: false })).toBe('user');
  });
});

// Build a spec with one operation per access level, plus one unannotated
// (defaults to public) and one with an unknown level.
function buildSpec(): OpenApiSpec {
  return {
    openapi: '3.0.3',
    paths: {
      '/public': { get: { 'x-access-level': 'public', responses: {} } },
      '/user': { get: { 'x-access-level': 'user', responses: {} } },
      '/admin': { get: { 'x-access-level': 'admin', responses: {} } },
      '/superadmin': { get: { 'x-access-level': 'superadmin', responses: {} } },
      '/unannotated': { get: { responses: {} } },
      '/typo': { get: { 'x-access-level': 'superAdmin', responses: {} } },
    },
  };
}

const visiblePaths = (spec: OpenApiSpec) => Object.keys(spec.paths ?? {}).sort();

describe('filterSpecByAccessLevel — path visibility', () => {
  it('shows an anonymous user only public + unannotated operations', () => {
    expect(visiblePaths(filterSpecByAccessLevel(buildSpec(), 'public'))).toEqual([
      '/public',
      '/unannotated',
    ]);
  });

  it('shows a "user" public + user (cumulative), not admin/superadmin', () => {
    expect(visiblePaths(filterSpecByAccessLevel(buildSpec(), 'user'))).toEqual([
      '/public',
      '/unannotated',
      '/user',
    ]);
  });

  it('shows an "admin" everything up to admin, not superadmin', () => {
    expect(visiblePaths(filterSpecByAccessLevel(buildSpec(), 'admin'))).toEqual([
      '/admin',
      '/public',
      '/unannotated',
      '/user',
    ]);
  });

  it('shows a "superadmin" all recognized levels', () => {
    expect(visiblePaths(filterSpecByAccessLevel(buildSpec(), 'superadmin'))).toEqual([
      '/admin',
      '/public',
      '/superadmin',
      '/unannotated',
      '/user',
    ]);
  });

  it('hides an operation with an unknown x-access-level from everyone (fail closed)', () => {
    for (const level of ACCESS_LEVEL_ORDER) {
      expect(visiblePaths(filterSpecByAccessLevel(buildSpec(), level))).not.toContain('/typo');
    }
  });

  it('drops a path whose only operation was filtered out', () => {
    const spec: OpenApiSpec = {
      paths: { '/admin-only': { post: { 'x-access-level': 'admin', responses: {} } } },
    };
    expect(filterSpecByAccessLevel(spec, 'public').paths).toEqual({});
  });

  it('keeps a mixed path but only its visible operations', () => {
    const spec: OpenApiSpec = {
      paths: {
        '/mixed': {
          get: { 'x-access-level': 'public', responses: {} },
          delete: { 'x-access-level': 'admin', responses: {} },
          parameters: [{ name: 'id', in: 'path' }],
        },
      },
    };
    const anon = filterSpecByAccessLevel(spec, 'public').paths?.['/mixed'] as Record<string, unknown>;
    expect(Object.keys(anon).sort()).toEqual(['get', 'parameters']);
  });

  it('returns the spec unchanged when there are no paths, and never mutates the input', () => {
    const noPaths: OpenApiSpec = { openapi: '3.0.3' };
    expect(filterSpecByAccessLevel(noPaths, 'public')).toBe(noPaths);

    const spec = buildSpec();
    const snapshot = JSON.stringify(spec);
    filterSpecByAccessLevel(spec, 'public');
    expect(JSON.stringify(spec)).toBe(snapshot);
  });
});

describe('filterSpecByAccessLevel — component schema pruning', () => {
  // A public operation references PublicBody; an admin operation references
  // AdminBody, which in turn references AdminNested. AdminBody/AdminNested must
  // not leak to a public viewer.
  function specWithComponents(): OpenApiSpec {
    return {
      paths: {
        '/public': {
          get: {
            'x-access-level': 'public',
            responses: {
              200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicBody' } } } },
            },
          },
        },
        '/admin': {
          get: {
            'x-access-level': 'admin',
            responses: {
              200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminBody' } } } },
            },
          },
        },
      },
      components: {
        schemas: {
          PublicBody: { type: 'object' },
          AdminBody: {
            type: 'object',
            properties: { nested: { $ref: '#/components/schemas/AdminNested' } },
          },
          AdminNested: { type: 'object' },
        },
      },
    };
  }

  it('keeps only schemas reachable from visible paths for a public viewer', () => {
    const filtered = filterSpecByAccessLevel(specWithComponents(), 'public');
    expect(Object.keys(filtered.components?.schemas ?? {})).toEqual(['PublicBody']);
  });

  it('keeps transitively-referenced schemas for a viewer who can see the operation', () => {
    const filtered = filterSpecByAccessLevel(specWithComponents(), 'admin');
    expect(Object.keys(filtered.components?.schemas ?? {}).sort()).toEqual([
      'AdminBody',
      'AdminNested',
      'PublicBody',
    ]);
  });

  it('leaves non-schema component sections untouched', () => {
    const spec = specWithComponents();
    spec.components = {
      ...spec.components,
      securitySchemes: { sessionAuth: { type: 'apiKey' } },
    };
    const filtered = filterSpecByAccessLevel(spec, 'public');
    expect(filtered.components?.securitySchemes).toEqual({ sessionAuth: { type: 'apiKey' } });
  });
});
