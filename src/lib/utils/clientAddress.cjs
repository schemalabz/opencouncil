// Plain CommonJS, so that the telemetry preload can require it before Next starts.

const { isIPv4, isIPv6 } = require('node:net');

/**
 * The client's address, as App Platform's edge reports it in `do-connecting-ip`.
 * Never the first X-Forwarded-For entry: the client writes that header itself,
 * and the proxies in front of the app keep the client's value in first place.
 * The edge replaces a `do-connecting-ip` that the client sends (checked on
 * staging, 2026-11-22). The value is one IPv4 address or one IPv6 address,
 * often in compressed notation, without a port.
 *
 * @param {(name: string) => string | string[] | null | undefined} getHeader
 * @returns {string | undefined} undefined for a request that did not pass the edge,
 *   for example in local development
 */
function connectingAddress(getHeader) {
    const value = getHeader('do-connecting-ip');
    const address = Array.isArray(value) ? value[0] : value;
    return address?.trim() || undefined;
}

/**
 * The unit to count a client's requests by, for a rate limit:
 * - IPv4: the address. Many people can share one (carrier NAT).
 * - IPv6: the /64 block. A home or a server usually gets a whole /64, and can
 *   use a new address in it for every request. Any notation of the same block
 *   gives the same key.
 * - IPv4 written as IPv6 (`::ffff:1.2.3.4`): the IPv4 address.
 * - Anything else: the value as it is.
 *
 * @param {string} address
 * @returns {string}
 */
function addressGroup(address) {
    const bare = address.trim().replace(/%.*$/, ''); // An IPv6 zone id ("fe80::1%eth0").
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(bare);
    if (mapped && isIPv4(mapped[1])) return mapped[1];
    if (isIPv4(bare)) return bare;
    if (isIPv6(bare)) return `${ipv6Groups(bare).slice(0, 4).join(':')}::/64`;
    return address;
}

/**
 * The 8 groups of a valid IPv6 address, in lower case without leading zeros.
 *
 * @param {string} address
 * @returns {string[]}
 */
function ipv6Groups(address) {
    let text = address.toLowerCase();
    // The last 32 bits can be written as dotted IPv4 ("64:ff9b::192.0.2.1").
    const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
    if (dotted) {
        const [a, b, c, d] = dotted.slice(1).map(Number);
        text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    }
    const [head, tail] = text.split('::');
    const left = head ? head.split(':') : [];
    const right = tail ? tail.split(':') : [];
    const zeros = tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
    return [...left, ...zeros, ...right].map(group => parseInt(group, 16).toString(16));
}

module.exports = { connectingAddress, addressGroup };
