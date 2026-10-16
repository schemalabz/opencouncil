import { assertLocalTarget, parseLocalTarget, RemoteTargetError } from './target-guard';

describe('assertLocalTarget', () => {
    test.each([
        'postgresql://seed@127.0.0.1:54390/scratch',
        'postgresql://opencouncil@localhost:5432/opencouncil',
        'postgres://opencouncil@localhost:5432/opencouncil',
        'postgresql://opencouncil@[::1]:5432/opencouncil',
        'postgresql://opencouncil@:5432/opencouncil?host=/tmp/oc-pg-abc',
        'postgresql://seed@localhost:5432/scratch?host=/tmp/oc-seed-abc',
        'postgresql://u:secret@localhost:5432/db?sslmode=disable',
    ])('accepts %s', (url) => {
        expect(() => assertLocalTarget(url)).not.toThrow();
    });

    test.each([
        'postgresql://readandwrite:x@db-postgresql-fra1-75673-do-user-14816875-0.h.db.ondigitalocean.com:25060/production?sslmode=require',
        'postgresql://app_staging:x@db-postgresql-fra1-75673-do-user-14816875-0.h.db.ondigitalocean.com:25060/staging',
        'postgresql://u@192.168.1.10/db',
        'postgresql://u@opencouncil.gr/db',
        'evil.host/db?host=/tmp/x',
        'host=localhost dbname=db',
    ])('refuses a remote or unreadable URL: %s', (url) => {
        expect(() => assertLocalTarget(url)).toThrow(RemoteTargetError);
    });

    // libpq applies query parameters after the authority, so a loopback authority
    // does not guarantee a loopback connection.
    test.each([
        'postgresql://u@localhost:5432/db?host=db-prod.example.com',
        'postgresql://u@localhost/db?sslmode=require&host=evil.host',
        'postgresql://u@localhost/db?host=localhost',
        'postgresql://u@/db?host=/tmp/a,evil.host',
        'postgresql://u@/db?host=%zz',
    ])('refuses a host parameter that is not one socket directory: %s', (url) => {
        expect(() => assertLocalTarget(url)).toThrow(RemoteTargetError);
    });

    // Each of these reaches a host the guard would not otherwise see.
    test.each([
        ['a percent-encoded key, which libpq decodes', 'postgresql://u@localhost/db?%68ost=staging.example.com'],
        ['a host list in the authority', 'postgresql://u@localhost:5432,staging.example.com:5432/db'],
        ['a bracketed host list', 'postgresql://u@[::1]:5432,[2001:db8::1]:5432/db'],
        ['a service, which reads a service file', 'postgresql://u@localhost/db?service=prod'],
        ['a hostaddr, which overrides the host', 'postgresql://u@localhost/db?hostaddr=203.0.113.9'],
        ['a repeated host', 'postgresql://u@/db?host=/tmp/x&host=/tmp/y'],
    ])('refuses %s', (_case, url) => {
        expect(() => assertLocalTarget(url)).toThrow(RemoteTargetError);
    });

    // The child tools run without PGPORT, PGUSER, and PGDATABASE, and node-postgres
    // reads them, so a URL that leaves one out could reach two databases.
    test.each([
        'postgresql://seed@localhost/scratch',
        'postgresql://localhost:5432/scratch',
        'postgresql://seed@localhost:5432',
        'postgresql://seed@localhost:5432/',
        'postgresql://seed@/scratch?host=/tmp/oc-seed-abc',
    ])('refuses %s, which leaves out the port, the user, or the database', (url) => {
        expect(() => assertLocalTarget(url)).toThrow(/must name the port, the user, and the database/);
    });

    // Prisma ignores these in the query string, so it would connect somewhere else than psql.
    test.each(['port=5491', 'user=other', 'dbname=other'])('refuses ?%s, which Prisma does not read', (param) => {
        expect(() => assertLocalTarget(`postgresql://u@localhost/db?host=/tmp/x&${param}`)).toThrow(RemoteTargetError);
    });
});

describe('parseLocalTarget', () => {
    test.each([
        ['postgresql://seed@127.0.0.1:54390/scratch', { host: '127.0.0.1', port: 54390, user: 'seed', database: 'scratch', password: '' }],
        ['postgresql://seed@localhost:5432/scratch?host=/tmp/oc-seed-AbC123', { host: '/tmp/oc-seed-AbC123', port: 5432, user: 'seed', database: 'scratch', password: '' }],
        ['postgresql://seed@:5433/db?host=/tmp/oc-seed-AbC123', { host: '/tmp/oc-seed-AbC123', port: 5433, user: 'seed', database: 'db', password: '' }],
        ['postgresql://seed@[::1]:5433/scratch', { host: '::1', port: 5433, user: 'seed', database: 'scratch', password: '' }],
        ['postgresql://seed:p%40ss@localhost:5432/my%20db', { host: 'localhost', port: 5432, user: 'seed', database: 'my db', password: 'p@ss' }],
        ['postgresql://seed@localhost:5432/db?password=q', { host: 'localhost', port: 5432, user: 'seed', database: 'db', password: 'q' }],
    ])('reads %s', (url, expected) => {
        expect(parseLocalTarget(url)).toEqual(expected);
    });
});
