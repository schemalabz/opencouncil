import { errorResponse } from '@/lib/api/errors';

/**
 * The answer for an api path that has no route. Without this handler the
 * path matches `[locale]/[cityId]` with `api` as the locale, and the pages
 * below it run their queries before the locale layout answers 404 (see
 * cityIdCandidate). The proxy does not see the path: its matcher skips
 * `/api/`. Next answers HEAD with GET.
 */
function notFound() {
    return errorResponse(404, 'Not found');
}

export {
    notFound as GET,
    notFound as POST,
    notFound as PUT,
    notFound as PATCH,
    notFound as DELETE,
    notFound as OPTIONS,
};
