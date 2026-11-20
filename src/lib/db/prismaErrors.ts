import { Prisma } from '@prisma/client'

/**
 * A Prisma message opens with "Invalid `prisma.x.y()` invocation". In the
 * colorless format (development and tests) the next line names the source
 * file, and a code frame follows. A validation error then shows the argument
 * tree, with the values. The reason comes last, on one or more lines that
 * start at the margin ("Unique constraint failed on the fields: (`email`)",
 * "Error occurred during query execution:" and the ConnectorError). The code
 * frame and the tree are indented, start with "→", or are a lone brace.
 *
 * The summary keeps the opening line and the reason lines. A ConnectorError
 * can carry the Postgres detail, which repeats the values of a row ("Failing
 * row contains (…)"), so the detail goes too.
 */
export function prismaMessageSummary(message: string): string {
    const lines = message.split('\n').filter(line => line.trim())
    const opening = /^Invalid `[^`]*` invocation/.test(lines[0] ?? '') ? lines[0].trim() : null
    const rest = opening ? lines.slice(1) : lines
    const reason = rest.filter(line => !/^(\s|→|[{}])/.test(line) && !SOURCE_LOCATION.test(line))
    const summary = [opening, ...reason].filter(Boolean).join(' ') || message.trim()
    return maskContacts(summary.replace(POSTGRES_DETAIL, 'detail: [removed]'))
}

// The line after "invocation in" in the colorless format: /path/to/file.ts:110:28
const SOURCE_LOCATION = /^\S+:\d+:\d+$/

const POSTGRES_DETAIL = /detail: Some\("(?:[^"\\]|\\.)*"\)/g

const PRISMA_ERRORS = [
    Prisma.PrismaClientKnownRequestError,
    Prisma.PrismaClientUnknownRequestError,
    Prisma.PrismaClientValidationError,
    Prisma.PrismaClientInitializationError,
    Prisma.PrismaClientRustPanicError,
]

/**
 * Rewrites the message and the stack of a Prisma error to the call and the
 * reason, in place. A Prisma error prints the failed call with its arguments
 * (an email, a name, a phone number, an embedding), in its message and again
 * in its stack, in every error format. The class, the code and the meta stay,
 * so `instanceof` and `error.code` checks work as before.
 */
export function withoutArguments(error: unknown): unknown {
    if (!PRISMA_ERRORS.some(ErrorClass => error instanceof ErrorClass)) return error
    const prismaError = error as Error
    const frames = (prismaError.stack ?? '').split('\n').filter(line => /^\s+at /.test(line))
    prismaError.message = prismaMessageSummary(prismaError.message)
    prismaError.stack = [`${prismaError.name}: ${prismaError.message}`, ...frames].join('\n')
    return prismaError
}

// A reason line can still quote a value: a database error on a raw query
// repeats the conflicting key ("Key (email)=(…) already exists").
function maskContacts(text: string): string {
    return text
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, '[email]')
        .replace(/(?<![\w+])\+[1-9]\d{7,14}(?!\d)/g, '[phone]')
}
