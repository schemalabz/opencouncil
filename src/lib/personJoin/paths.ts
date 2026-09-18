/**
 * The path of the join flow for a code. The token rides in the query, not
 * in the path: it holds a dot, and the proxy skips every dotted path, so a
 * page under /join/<token> would lose locale routing on the other realms.
 * No server imports: the flow's client components build this path too.
 */
export function personJoinPagePath(cityId: string, token: string): string {
    return `/${cityId}/join?c=${encodeURIComponent(token)}`;
}
