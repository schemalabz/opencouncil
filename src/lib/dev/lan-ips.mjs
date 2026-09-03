import os from 'os';

/**
 * Non-internal IPv4 addresses of this machine, in interface enumeration order.
 *
 * Plain `.mjs` so that `next.config.mjs` (loaded by Node, no TypeScript) and the
 * `/api/dev/lan-info` route can share one definition of "the LAN address a phone
 * can reach". Both feed the mobile preview: the route builds the QR-code URL, and
 * the config lists the same addresses in `allowedDevOrigins`.
 *
 * @returns {string[]}
 */
export function lanIPv4Addresses() {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter((iface) => iface !== undefined && iface.family === 'IPv4' && !iface.internal)
        .map((iface) => iface.address);
}
