// Plain CommonJS: telemetry.cjs requires it before Next starts; src/env.mjs
// imports it.

/**
 * The deployment target when DEPLOYMENT_ENV is not set. Previews and staging
 * declare themselves; everywhere else it follows NODE_ENV.
 *
 * @param {string | undefined} nodeEnv
 * @returns {'development' | 'production'}
 */
function defaultDeploymentEnv(nodeEnv) {
    return nodeEnv === 'development' ? 'development' : 'production';
}

module.exports = { defaultDeploymentEnv };
