/**
 * The path of the join flow for a code. The token rides in the query, not
 * in the path: it holds a dot, and the proxy skips every dotted path, so a
 * page under /join/<token> would lose locale routing on the other realms.
 * No server imports: the flow's client components build this path too.
 */
export function personJoinPagePath(cityId: string, token: string): string {
    // A token is [A-Za-z0-9._-] only, which a query takes as it is.
    return `/${cityId}/join?c=${token}`;
}
