/**
 * The path of the join flow for a code. The token rides in the query, not
 * in the path: it holds a dot, and the proxy answers 404 for a path with a
 * dot that is not a file (see `dottedPathVerdict`).
 * No server imports: the flow's client components build this path too.
 */
export function personJoinPagePath(cityId: string, token: string): string {
    // A token is [A-Za-z0-9._-] only, which a query takes as it is.
    return `/${cityId}/join?c=${token}`;
}
