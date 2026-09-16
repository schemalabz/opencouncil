import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { env } from '@/env.mjs';

// The answer describes this instance at this moment. A cached one names a
// commit that no longer runs.
export const dynamic = 'force-dynamic';

/**
 * A stable, anonymous name for the container that answers.
 *
 * The platform's hostname identifies the container, but it also publishes the
 * internal naming and, over several requests, the size of the fleet. A hash
 * keeps the one property a caller needs, which is that two instances differ.
 *
 * The value is read per request rather than at module load. The hostname does
 * not change while a container runs, so the two are equivalent, and reading it
 * here keeps the function testable.
 */
function instanceName(): string | null {
    const host = process.env.HOSTNAME;

    return host ? createHash('sha256').update(host).digest('hex').slice(0, 8) : null;
}

/**
 * What this instance is, and what it runs.
 *
 * The route reports identity only. It reads no database and calls no other
 * service, so it answers at the same speed whether or not the rest of the
 * system is healthy, and it tells a caller nothing about the state of a
 * backend.
 *
 * `service` separates this route from the one the notis app serves at the same
 * path. A caller that polls the wrong host gets an answer either way.
 *
 * `commit` reads a `NEXT_PUBLIC_` variable on the server on purpose. The
 * bundler freezes such a value at build time, and the commit of a build is a
 * build-time constant, so the freeze is the property this route wants. App
 * Platform supplies it from `${opencouncil.COMMIT_HASH}`. The value is null
 * when a deployment does not set the variable.
 *
 * `instance` matters because the service autoscales. Two answers that name
 * different commits mean a deployment is still rolling out.
 *
 * The route is public and needs no session. It names no person, and this
 * repository is public, so the commit is already published.
 */
export function GET() {
    return NextResponse.json(
        {
            service: 'opencouncil',
            commit: env.NEXT_PUBLIC_BUILD_COMMIT_SHA || null,
            instance: instanceName(),
        },
        { headers: { 'Cache-Control': 'no-store' } },
    );
}
