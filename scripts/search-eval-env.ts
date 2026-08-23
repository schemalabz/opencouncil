/**
 * Environment setup for scripts/search-eval.ts, in its own module because it
 * MUST run before `src/lib/search/query` (and through it `@/env.mjs`) is
 * evaluated.
 *
 * Import declarations are hoisted, so statements written above an import in the
 * same file still run after every module that file imports. The same two lines
 * inside search-eval.ts therefore ran too late: `@/env.mjs` had already captured
 * `process.env` (createEnv reads it at module init, and SKIP_ENV_VALIDATION
 * skips the zod default too), so `env.ELASTICSEARCH_INDEX` came out undefined
 * and every buildSearchQuery result carried `index: undefined`.
 *
 * A side-effect import of this module, placed first, does run first: modules
 * evaluate in the order their imports are declared.
 */
import { config } from 'dotenv';

config();
process.env.ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX || 'subjects';
