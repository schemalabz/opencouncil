export type AccessLevel = 'public' | 'user' | 'admin' | 'superadmin';

export const ACCESS_LEVEL_ORDER: AccessLevel[] = ['public', 'user', 'admin', 'superadmin'];

type OpenApiOperation = {
    'x-access-level'?: string;
    [key: string]: unknown;
};

type OpenApiPathItem = {
    [method: string]: OpenApiOperation | unknown;
};

export type OpenApiSpec = {
    paths?: Record<string, OpenApiPathItem>;
    info?: Record<string, unknown>;
    [key: string]: unknown;
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

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

            if (ACCESS_LEVEL_ORDER.indexOf(opLevel) <= ACCESS_LEVEL_ORDER.indexOf(userLevel)) {
                filteredPathItem[key] = operation;
                hasAnyOperation = true;
            }
        }

        if (hasAnyOperation) {
            filteredPaths[path] = filteredPathItem;
        }
    }

    return { ...spec, paths: filteredPaths };
}

export type { OpenApiOperation, OpenApiPathItem };
