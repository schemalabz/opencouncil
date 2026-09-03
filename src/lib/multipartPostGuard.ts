/**
 * Decide whether a request is a multipart POST that carries no Next-Action
 * header. Next.js treats such a request as a no-JavaScript submission of
 * a server-action form: it parses the body for `$ACTION_ID_` fields and,
 * when it finds none it recognises, throws instead of answering 404
 * (vercel/next.js#90090). In production that throw is a 500 and an
 * onRequestError alert. This app has no no-JavaScript server-action forms,
 * so the request can never be legitimate; vulnerability scanners send it
 * to `/` several times a day. The proxy answers 404 before anything renders.
 *
 * The match mirrors Next's own classification (case-sensitive method and
 * media type) so the guard covers exactly the requests Next would throw
 * on. A POST that carries the header, even empty, is a fetch-style server
 * action that Next resolves itself (an unknown ID gets a quiet 404). Other
 * content types never reach the throwing branch.
 *
 * Relax this guard before adding a `<form action={serverAction}>`,
 * `formAction={serverAction}`, or `useActionState` form: a submit before
 * hydration posts exactly this shape. Remove it once the upstream fix
 * ships.
 *
 * Pure function so the proxy's decision is unit-testable.
 */
export function isHeaderlessMultipartPost(
    method: string,
    contentTypeHeader: string | null,
    nextActionHeader: string | null,
): boolean {
    if (method !== 'POST') return false;
    if (nextActionHeader !== null) return false;
    return (contentTypeHeader ?? '').startsWith('multipart/form-data');
}
