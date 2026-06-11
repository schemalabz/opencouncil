import type { Instrumentation } from 'next';

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  // Keep the Node-only code (cache handler + Prisma boot probe with
  // process.exit) in a separate module so Next's Edge-runtime bundler never
  // sees it — static analysis can't follow the runtime guard above.
  const { runNodeInstrumentation } = await import('./instrumentation-node');
  await runNodeInstrumentation();
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  // Log first so we get visibility even if Discord fails.
  console.error(
    `[onRequestError] ${context.routeType} ${context.routePath} (${request.method} ${request.path}):`,
    error
  );

  // Skip Discord in dev so local errors don't spam the team channel.
  if (process.env.NODE_ENV === 'development') return;

  const err = error as Error & { digest?: string };
  const { sendErrorAdminAlert } = await import('@/lib/discord');
  await sendErrorAdminAlert({
    source: `${context.routerKind} ${context.routeType}`,
    error: err.stack ?? err.message ?? String(error),
    context: {
      url: `${request.method} ${request.path}`,
      route: context.routePath,
      digest: err.digest,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
  });
};
