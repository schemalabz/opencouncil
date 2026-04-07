export type AccessLevel = 'public' | 'user' | 'admin' | 'superadmin';

export const ACCESS_LEVEL_ORDER: AccessLevel[] = ['public', 'user', 'admin', 'superadmin'];

/**
 * Determine the access level for the current user.
 * Shared between the docs page and the /api spec endpoint.
 */
export function getUserAccessLevel(user: { isSuperAdmin: boolean; administers?: unknown[] } | null): AccessLevel {
    if (!user) return 'public';
    if (user.isSuperAdmin) return 'superadmin';
    if ((user.administers ?? []).length > 0) return 'admin';
    return 'user';
}

type OpenApiOperation = {
    'x-access-level'?: string;
    [key: string]: unknown;
};

type OpenApiPathItem = {
    [method: string]: OpenApiOperation | unknown;
};

type OpenApiComponents = {
    schemas?: Record<string, unknown>;
    [key: string]: unknown;
};

export type OpenApiSpec = {
    paths?: Record<string, OpenApiPathItem>;
    info?: Record<string, unknown>;
    components?: OpenApiComponents;
    [key: string]: unknown;
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

const SCHEMA_REF = /^#\/components\/schemas\/(.+)$/;

/**
 * Recursively collect the names of every `#/components/schemas/X` schema
 * referenced (via `$ref`) anywhere within `value`.
 */
function collectSchemaRefs(value: unknown, acc: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) collectSchemaRefs(item, acc);
        return;
    }
    if (value && typeof value === 'object') {
        for (const [key, val] of Object.entries(value)) {
            if (key === '$ref' && typeof val === 'string') {
                const match = val.match(SCHEMA_REF);
                if (match) acc.add(match[1]);
            } else {
                collectSchemaRefs(val, acc);
            }
        }
    }
}

/**
 * Given the schemas reachable directly from the visible paths, expand the set
 * to include schemas those schemas reference, transitively.
 */
function reachableSchemas(seed: Set<string>, schemas: Record<string, unknown>): Set<string> {
    const reachable = new Set<string>();
    const queue = [...seed];
    while (queue.length > 0) {
        const name = queue.shift();
        if (name === undefined || reachable.has(name)) continue;
        reachable.add(name);
        const refs = new Set<string>();
        collectSchemaRefs(schemas[name], refs);
        for (const ref of refs) {
            if (!reachable.has(ref)) queue.push(ref);
        }
    }
    return reachable;
}

export function filterSpecByAccessLevel(spec: OpenApiSpec, userLevel: AccessLevel): OpenApiSpec {
    if (!spec.paths) return spec;

    const filteredPaths: Record<string, OpenApiPathItem> = {};

    for (const [path, pathItem] of Object.entries(spec.paths)) {
        const filteredPathItem: OpenApiPathItem = {};
        let hasAnyOperation = false;

        for (const [key, value] of Object.entries(pathItem)) {
            if (!HTTP_METHODS.includes(key)) {
                // Keep non-operation fields (path-level parameters, summaries, etc.) unchanged.
                filteredPathItem[key] = value;
                continue;
            }

            const operation = value as OpenApiOperation;
            const opLevel = (operation['x-access-level'] ?? 'public') as AccessLevel;
            const opIndex = ACCESS_LEVEL_ORDER.indexOf(opLevel);

            // Unrecognized x-access-level values are treated as maximally
            // restrictive (hidden from everyone) so a typo can never
            // accidentally expose an endpoint to public users.
            if (opIndex === -1) continue;

            if (opIndex <= ACCESS_LEVEL_ORDER.indexOf(userLevel)) {
                filteredPathItem[key] = operation;
                hasAnyOperation = true;
            }
        }

        if (hasAnyOperation) {
            filteredPaths[path] = filteredPathItem;
        }
    }

    const filtered: OpenApiSpec = { ...spec, paths: filteredPaths };

    // Prune component schemas that are unreachable from the visible paths.
    // Filtering only `paths` would still leak the names and shapes of admin-only
    // schemas (e.g. via `components.schemas`) to lower-privilege viewers, which
    // defeats the purpose of hiding those operations.
    if (spec.components?.schemas) {
        const seed = new Set<string>();
        collectSchemaRefs(filteredPaths, seed);
        const keep = reachableSchemas(seed, spec.components.schemas);

        const prunedSchemas: Record<string, unknown> = {};
        for (const [name, schema] of Object.entries(spec.components.schemas)) {
            if (keep.has(name)) prunedSchemas[name] = schema;
        }
        filtered.components = { ...spec.components, schemas: prunedSchemas };
    }

    return filtered;
}

export type { OpenApiOperation, OpenApiPathItem };
