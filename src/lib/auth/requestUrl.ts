/**
 * The deployment's host against the host a request arrived on, and the move
 * of a URL onto that host. Pure: no env and no Next imports, because
 * `auth.config.ts` pulls this into the middleware bundle, and the tests run
 * it without the env module.
 */

/**
 * Whether `host` (`hostname[:port]`, as the Host header carries it) is the
 * host that `baseUrl` names. Case does not matter. The port does: in
 * development the session cookie is per port. False for an unparsable base.
 */
export function isBaseUrlHost(host: string | null, baseUrl: string): boolean {
    if (!host) return false;
    try {
        return host.toLowerCase() === new URL(baseUrl).host.toLowerCase();
    } catch {
        return false;
    }
}

/**
 * Moves `url` onto `host`, in place. A forwarded `https` upgrades the scheme
 * and nothing downgrades it: the header is as attacker-controllable as the
 * host the caller allowlisted, and it decides whether a token travels in
 * cleartext. Hostname and port are set separately: assigning a port-less
 * `host` keeps the URL's old port, and a bind address's :3000 would leak
 * into the result.
 */
export function retargetUrl(url: URL, host: string, forwardedProto: string | null): URL {
    if (forwardedProto === 'https') url.protocol = 'https:';
    const [hostname, port = ''] = host.split(':');
    url.hostname = hostname;
    url.port = port;
    return url;
}
