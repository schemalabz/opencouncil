// Node-only instrumentation. Imported dynamically from src/instrumentation.ts
// inside the `process.env.NEXT_RUNTIME === 'nodejs'` guard so the contents are
// never bundled into the Edge runtime (which would warn about `process.exit`).

import { totalmem } from 'os';
import { getHeapStatistics } from 'v8';
import { registerInitialCache } from '@fortedigital/nextjs-cache-handler/instrumentation';
import CacheHandler from '../cache-handler.mjs';
import prisma from '@/lib/db/prisma';

const MB = 2 ** 20;
// Without a cgroup limit, Node reports a sentinel near 2^63 or 2^64 bytes, not 0.
const NO_LIMIT_BYTES = 2 ** 60;

export async function runNodeInstrumentation() {
  // `production:start` sizes the V8 heap as a share of the memory that Node
  // sees. A heap limit above the container memory gets the instance killed
  // without a log line, and a limit that the working set reaches freezes it.
  // Record what each instance got. If the container hides its limit, Node sizes
  // the heap from the host memory instead, and this line shows that. It runs
  // before any await, so a stalled cache handler cannot hide it.
  const heapLimitMb = Math.round(getHeapStatistics().heap_size_limit / MB);
  const containerBytes = process.constrainedMemory();
  const container = containerBytes > 0 && containerBytes < NO_LIMIT_BYTES ? `${Math.round(containerBytes / MB)} MB` : 'no limit';
  console.info(
    `[instrumentation] V8 heap limit ${heapLimitMb} MB, container memory ${container}, host memory ${Math.round(totalmem() / MB)} MB`
  );

  await registerInitialCache(CacheHandler);

  // Prisma boot probe.
  //
  // We've seen DO Apps instances come up with no logs and 100% CPU until
  // manually restarted. The most plausible cause is the Prisma query engine
  // hanging on the first DB connection (DNS / IPv6 / TLS race against the
  // managed Postgres). Without an explicit probe, the hang only surfaces on
  // the first incoming request and never produces a useful log line, because
  // the engine doesn't log connection attempts and the process never gets
  // back to the event loop to flush anything.
  //
  // Forcing $connect() at boot with a hard timeout converts that silent
  // wedge into a fast, loud failure: the process exits non-zero and the
  // platform restarts the instance instead of leaving it stuck. We skip this
  // in development so a local DB outage doesn't crash the dev server.
  if (process.env.NODE_ENV === 'development') return;

  const TIMEOUT_MS = 15_000;

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`Prisma $connect timed out after ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS
    );
  });

  try {
    await Promise.race([prisma.$connect(), timeoutPromise]);
    console.info('[instrumentation] Prisma connected');
  } catch (error) {
    console.error(
      '[instrumentation] Prisma connection failed at boot — exiting so the platform restarts:',
      error
    );
    // Give stderr a tick to flush before exiting.
    setTimeout(() => process.exit(1), 100).unref();
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
