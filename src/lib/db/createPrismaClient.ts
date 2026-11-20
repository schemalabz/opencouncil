import { PrismaClient } from '@prisma/client'
import { prismaMessageSummary, withoutArguments } from './prismaErrors'

/**
 * The PrismaClient of the app. The test setup builds its client here too, so
 * the tests run with the same logging and the same errors.
 *
 * A Prisma error carries the failed call with its arguments, so any log line
 * or alert that prints it would hold a reader's data. The extension rewrites
 * each error that a query throws to the call and the reason (see
 * withoutArguments), so that every catch block can log the error as it is.
 *
 * Prisma's own error log prints the same call with its arguments. It is still
 * the only record of an engine error that no caller sees, such as a pooled
 * connection that the server closed, and of an error that a caller swallows.
 * So the client takes the errors as events and logs the summary only.
 *
 * The return type stays PrismaClient. The extension has a query component only,
 * so the models, the transactions and the raw queries have the same signatures.
 * Prisma types an extended client as a different type all the same, which no
 * `Prisma.TransactionClient` parameter in the app accepts. The client drops
 * `$on` and `$use`, which only this function calls.
 */
export function createPrismaClient(datasourceUrl: string | undefined): PrismaClient {
    const client = new PrismaClient({
        datasourceUrl,
        log: [{ emit: 'event', level: 'error' }, { emit: 'stdout', level: 'warn' }],
    })
    client.$on('error', (event) => {
        console.error(`prisma:error ${prismaMessageSummary(event.message)}`)
    })
    const extended = client.$extends({
        name: 'errors-without-arguments',
        query: {
            async $allOperations({ args, query }) {
                try {
                    return await query(args)
                } catch (error) {
                    throw withoutArguments(error)
                }
            },
        },
    })
    return extended as unknown as PrismaClient
}
