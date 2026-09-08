import type { Instrumentation } from 'next';
import { isClientDisconnectError } from './lib/clientDisconnectGuard';

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
  // A client that hangs up mid-stream is not an error; see
  // isClientDisconnectError for why Next reports it as one.
  if (isClientDisconnectError(error)) return;

  // Log first so we get visibility even if Discord fails.
  console.error(
    `[onRequestError] ${context.routeType} ${context.routePath} (${request.method} ${request.path}):`,
    error
  );

  // Skip Discord in dev so local errors don't spam the team channel.
  if (process.env.NODE_ENV === 'development') return;

  const err = error as Error & { digest?: string };
  // This runs after the request scope is gone, so the alert cannot read
  // headers() itself; its Host is what names the realm.
  const host = request.headers.host;
  // discord-core, not discord, and lazily: this handler is compiled for edge,
  // where discord.ts's database import would throw. Lazy so a future node-only
  // import in discord-core costs one alert rather than every proxied request.
  const { sendErrorAdminAlert } = await import('@/lib/discord-core');
  await sendErrorAdminAlert({
    source: `${context.routerKind} ${context.routeType}`,
    error: err.stack ?? err.message ?? String(error),
    host: Array.isArray(host) ? host[0] : host,
    context: {
      url: `${request.method} ${request.path}`,
      route: context.routePath,
      digest: err.digest,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
  });
};
