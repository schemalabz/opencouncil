import { NextResponse } from 'next/server';
import { env } from '@/env.mjs';

// The answer must come from the running process on each request, never from a
// copy made at build time that a cache could serve while the process is frozen.
export const dynamic = 'force-dynamic';

/**
 * The target of the liveness check of the App Platform service. The platform
 * restarts a container that stops answering this route.
 *
 * The route reads no database and calls no other service, so it fails only when
 * the process cannot run code, for example when garbage collection blocks the
 * event loop. A database outage therefore never restarts the fleet. Keep it free
 * of I/O.
 *
 * `service` separates this route from the one that the notis app serves at the
 * same path. `commit` is `NEXT_PUBLIC_BUILD_COMMIT_SHA` (see
 * docs/environment-variables.md), or null when the deployment does not set it.
 * The route is public and needs no session: the repository is public, so the
 * commit is too.
 */
export function GET() {
    return NextResponse.json(
        {
            service: 'opencouncil',
            commit: env.NEXT_PUBLIC_BUILD_COMMIT_SHA || null,
        },
        { headers: { 'Cache-Control': 'no-store' } },
    );
}
