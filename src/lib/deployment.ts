// The dev-tooling gate (issue #250): dev tooling is allowed in local dev and on
// previews, never on staging or real production.
//
// Reads process.env directly rather than @/env.mjs so that data-access modules
// (src/lib/db/*) can share this single gate without importing env.mjs, which the
// jest transform cannot parse. DEPLOYMENT_ENV is still declared and validated in
// env.mjs, which the rest of the app imports, so an invalid value is caught at
// startup there; here an unrecognized value simply resolves to the locked
// (production) side. The default mirrors env.mjs: NODE_ENV drives it when
// DEPLOYMENT_ENV is unset.
//
// `devToolsAllowed()` reads the environment on each call, so callers that must
// react to a value set at request/test time use it. `DEV_TOOLS_ALLOWED` captures
// the value at module load for the common case.
export function devToolsAllowed(): boolean {
    const deploymentEnv = process.env.DEPLOYMENT_ENV
        ?? (process.env.NODE_ENV === 'development' ? 'development' : 'production');
    return deploymentEnv === 'development' || deploymentEnv === 'preview';
}

export const DEV_TOOLS_ALLOWED = devToolsAllowed();
