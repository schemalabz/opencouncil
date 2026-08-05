import { env } from '@/env.mjs';

// Server-only (env.mjs throws in client bundles). Client components that need
// preview-awareness receive it as a prop from a server component instead.
export const DEV_TOOLS_ALLOWED = env.DEPLOYMENT_ENV === 'development' || env.DEPLOYMENT_ENV === 'preview';
