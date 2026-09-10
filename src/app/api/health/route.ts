import { NextResponse } from 'next/server';
import { env } from '@/env.mjs';
import { getDatabaseState } from '@/lib/db/health';

// The answer describes this instance at this moment. A cached one names a
// commit that no longer runs.
export const dynamic = 'force-dynamic';

/**
 * What the code is, and what the schema is.
 *
 * The `/release` skill polls this route between the two builds of a release
 * that drops a column. It waits for `commit` to name the first build before it
 * pushes the second. That is how it deploys without DigitalOcean credentials.
 *
 * The route is public and needs no session. It carries no data about a person.
 */
export async function GET() {
    const { database, migration } = await getDatabaseState();

    return NextResponse.json(
        {
            commit: env.NEXT_PUBLIC_BUILD_COMMIT_SHA ?? null,
            migration,
            database,
        },
        { headers: { 'Cache-Control': 'no-store' } },
    );
}
