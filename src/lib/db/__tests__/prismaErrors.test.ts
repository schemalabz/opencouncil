/** @jest-environment node */
import { inspect } from 'node:util';
import { Prisma } from '@prisma/client';
import { prismaMessageSummary, withoutArguments } from '../prismaErrors';

const CANARY_EMAIL = 'canary-prisma@example.test';

// Message shapes as Prisma 5.22 writes them: `minimal` in production, `colorless` elsewhere.
const VALIDATION_MINIMAL = [
    '',
    'Invalid `prisma.user.create()` invocation:',
    '',
    '{',
    '  data: {',
    `    email: "${CANARY_EMAIL}",`,
    '    name: 42',
    '          ~~',
    '  }',
    '}',
    '',
    'Argument `name`: Invalid value provided. Expected String or Null, provided Int.',
].join('\n');
const VALIDATION_COLORLESS = [
    '',
    'Invalid `prisma.user.create()` invocation in',
    '/app/src/lib/db/users.ts:110:28',
    '',
    '  107 }',
    '  108',
    '→ 110 const user = await prisma.user.create({',
    '        data: {',
    `          email: "${CANARY_EMAIL}",`,
    '          name: 42',
    '        }',
    '      })',
    '',
    'Argument `name`: Invalid value provided. Expected String or Null, provided Int.',
].join('\n');

describe('prismaMessageSummary', () => {
    it.each([['minimal', VALIDATION_MINIMAL, ':'], ['colorless', VALIDATION_COLORLESS, ' in']])(
        'gives the call and the reason of a validation error (%s format), without its arguments',
        (_format, message, afterCall) => {
            expect(prismaMessageSummary(message)).toBe('Invalid `prisma.user.create()` invocation' + afterCall
                + ' Argument `name`: Invalid value provided. Expected String or Null, provided Int.');
        },
    );

    it('finds the reason right after the code frame of the colorless format', () => {
        const message = [
            '',
            'Invalid `prisma.user.create()` invocation in',
            '/app/src/lib/db/users.ts:17:44',
            '',
            '  16 await prisma.user.create({ data: { email } })',
            '→ 17 await prisma.user.create(',
            'Unique constraint failed on the fields: (`email`)',
        ].join('\n');
        expect(prismaMessageSummary(message)).toBe('Invalid `prisma.user.create()` invocation in Unique constraint failed on the fields: (`email`)');
    });

    it('keeps every line of a database error, and removes the Postgres detail', () => {
        const message = [
            '',
            'Invalid `prisma.user.update()` invocation:',
            '',
            '',
            'Error occurred during query execution:',
            `ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "23502", message: "null value in column \\"name\\" violates not-null constraint", severity: "ERROR", detail: Some("Failing row contains (u1, ${CANARY_EMAIL}, null)."), column: None, hint: None }), transient: false })`,
        ].join('\n');

        const summary = prismaMessageSummary(message);

        expect(summary).toContain('Invalid `prisma.user.update()` invocation: Error occurred during query execution: ConnectorError(');
        expect(summary).toContain('violates not-null constraint');
        expect(summary).toContain('detail: [removed]');
        expect(summary).not.toContain(CANARY_EMAIL);
    });

    it('gives the reason of a known request error and of an initialization error', () => {
        expect(prismaMessageSummary('\nInvalid `prisma.user.create()` invocation:\n\n\nUnique constraint failed on the fields: (`email`)'))
            .toBe('Invalid `prisma.user.create()` invocation: Unique constraint failed on the fields: (`email`)');
        expect(prismaMessageSummary("\nInvalid `prisma.user.findFirst()` invocation:\n\n\nCan't reach database server at `db:5432`\n\nPlease make sure your database server is running at `db:5432`."))
            .toBe("Invalid `prisma.user.findFirst()` invocation: Can't reach database server at `db:5432` Please make sure your database server is running at `db:5432`.");
    });

    it('masks an address that a reason line repeats', () => {
        const message = `\nInvalid \`prisma.$executeRaw()\` invocation:\n\n\nRaw query failed. Code: \`23505\`. Message: \`Key (email)=(${CANARY_EMAIL}) already exists.\``;
        expect(prismaMessageSummary(message)).toContain('Key (email)=([email]) already exists.');
    });
});

describe('withoutArguments', () => {
    it('rewrites the message and the stack of a Prisma error in place, and keeps its class and code', () => {
        const error = new Prisma.PrismaClientKnownRequestError(
            `\nInvalid \`prisma.user.create()\` invocation:\n\n{\n  data: { email: "${CANARY_EMAIL}" }\n}\n\nUnique constraint failed on the fields: (\`email\`)`,
            { code: 'P2002', clientVersion: '5.22.0' },
        );

        const result = withoutArguments(error);

        expect(result).toBe(error);
        expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        expect(error.code).toBe('P2002');
        expect(error.message).toBe('Invalid `prisma.user.create()` invocation: Unique constraint failed on the fields: (`email`)');
        expect(error.stack).toMatch(/^PrismaClientKnownRequestError: Invalid `prisma\.user\.create\(\)` invocation: Unique constraint failed[^\n]*\n\s+at /);
        expect(inspect(error)).not.toContain(CANARY_EMAIL);
        expect(String(error)).not.toContain(CANARY_EMAIL);
    });

    it('leaves any other error as it is', () => {
        const error = new Error(`not from Prisma: ${CANARY_EMAIL}`);
        expect(withoutArguments(error)).toBe(error);
        expect(error.message).toContain(CANARY_EMAIL);
    });
});
