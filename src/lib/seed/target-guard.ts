import type { ConnectionInfo } from '@/lib/seed-pipeline/greenmask-config';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Query parameters that psql, pg_restore, node-postgres, and Prisma all read the
 * same way. Prisma ignores `port`, `user`, and `dbname` in the query string, and
 * `service` and `hostaddr` can send libpq to a host that the URL does not show.
 */
const ALLOWED_PARAMS = new Set(['host', 'password', 'sslmode', 'connect_timeout', 'application_name']);

/** `scheme://[userinfo@]authority[/path][?query][#fragment]` */
const URL_PARTS = /^postgres(?:ql)?:\/\/(?:([^@/?#]*)@)?([^/?#]*)(\/[^?#]*)?(?:\?([^#]*))?(?:#.*)?$/i;

/** `host[:port]` or `[ipv6][:port]` */
const AUTHORITY = /^(?:\[([^\]]*)\]|([^:]*))(?::(\d+))?$/;

export class RemoteTargetError extends Error {
    constructor(reason: string) {
        super(`refusing the database URL: ${reason}. The seed tools only write to a local database`);
        this.name = 'RemoteTargetError';
    }
}

export type LocalTarget = ConnectionInfo & { password: string };

function decode(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        throw new RemoteTargetError(`"${raw}" has a malformed percent-escape`);
    }
}

/**
 * Every seed command writes to a scratch or a developer database. The Nix shell
 * exports a remote DATABASE_URL from .env, so this check is what stands between
 * a typo and staging.
 *
 * The URL is accepted only in a form that every tool reads as the same single
 * local database: one loopback host or one socket directory (`?host=/path`), the
 * port, user, and database in the URL itself, and no query parameter outside
 * `ALLOWED_PARAMS`. The port, user, and database are required: the child tools
 * run without PGPORT, PGUSER, and PGDATABASE, but node-postgres in this process
 * reads them, so a URL that leaves one out can reach two databases. Query keys
 * are decoded first, as libpq decodes them, so `?%68ost=` counts as `host`.
 * Returns the connection that the URL names.
 */
export function parseLocalTarget(url: string): LocalTarget {
    const parts = URL_PARTS.exec(url);
    if (!parts) throw new RemoteTargetError('it is not a postgresql:// URL');
    const [, userinfo = '', authority, path = '', query = ''] = parts;
    if (authority.includes(',')) throw new RemoteTargetError(`"${authority}" names more than one host`);
    const hostPort = AUTHORITY.exec(authority);
    if (!hostPort) throw new RemoteTargetError(`"${authority}" is not a host and port`);
    const authorityHost = decode(hostPort[1] ?? hostPort[2]).toLowerCase();

    const params = new Map<string, string>();
    for (const [key, value] of new URLSearchParams(query)) {
        if (!ALLOWED_PARAMS.has(key)) throw new RemoteTargetError(`the query parameter "${key}" is not supported; put the port, user, and database in the URL itself`);
        if (params.has(key)) throw new RemoteTargetError(`the query parameter "${key}" is repeated`);
        params.set(key, value);
    }

    const socketDir = params.get('host');
    if (socketDir?.includes(',')) throw new RemoteTargetError(`host="${socketDir}" names more than one host`);
    if (socketDir !== undefined && !socketDir.startsWith('/')) throw new RemoteTargetError(`host="${socketDir}" is not a socket directory`);
    if (socketDir === undefined && !LOCAL_HOSTS.has(authorityHost)) {
        throw new RemoteTargetError(authorityHost ? `"${authorityHost}" is not a local host` : 'it names no host');
    }
    if (socketDir !== undefined && authorityHost !== '' && !LOCAL_HOSTS.has(authorityHost)) {
        throw new RemoteTargetError(`"${authorityHost}" is not a local host`);
    }

    const colon = userinfo.indexOf(':');
    const user = decode(colon < 0 ? userinfo : userinfo.slice(0, colon));
    const database = decode(path.replace(/^\//, ''));
    if (hostPort[3] === undefined || !user || !database) {
        throw new RemoteTargetError('it must name the port, the user, and the database, as in postgresql://user@localhost:5432/database');
    }
    return {
        host: socketDir ?? authorityHost,
        port: Number(hostPort[3]),
        user,
        database,
        password: params.get('password') ?? (colon < 0 ? '' : decode(userinfo.slice(colon + 1))),
    };
}

export function assertLocalTarget(url: string): void {
    parseLocalTarget(url);
}
