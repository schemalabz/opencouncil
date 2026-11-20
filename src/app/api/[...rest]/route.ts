import { NextResponse } from 'next/server';

/**
 * The answer for an api path that has no route. Without this handler the
 * path matches `[locale]/[cityId]` with `api` as the locale, and Next renders
 * the city page, with its queries, before the locale layout answers 404. The
 * proxy does not see the path: its matcher skips `/api/`.
 */
function notFound() {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export {
    notFound as GET,
    notFound as HEAD,
    notFound as POST,
    notFound as PUT,
    notFound as PATCH,
    notFound as DELETE,
    notFound as OPTIONS,
};
