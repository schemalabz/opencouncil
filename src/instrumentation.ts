export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

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
  if (process.env.NODE_ENV !== 'development') {
    const { default: prisma } = await import('@/lib/db/prisma');
    const TIMEOUT_MS = 15_000;

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () =>
          reject(
            new Error(`Prisma $connect timed out after ${TIMEOUT_MS}ms`)
          ),
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
      return;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}
