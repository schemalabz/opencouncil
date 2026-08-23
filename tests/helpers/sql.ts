/**
 * Split a migration file into single statements for Prisma's
 * $executeRawUnsafe (which sends one statement per call). Respects
 * dollar-quoted blocks (DO $$ ... $$;) so their inner semicolons do not
 * split the block.
 */
export function splitSqlStatements(sql: string): string[] {
    const statements: string[] = []
    let current = ''
    let inDollarQuote = false

    for (const line of sql.split('\n')) {
        current += line + '\n'
        const dollarMarkers = (line.match(/\$\$/g) ?? []).length
        if (dollarMarkers % 2 === 1) {
            inDollarQuote = !inDollarQuote
        }
        if (!inDollarQuote && line.trimEnd().endsWith(';')) {
            statements.push(current)
            current = ''
        }
    }

    return statements.filter((s) => s.trim().length > 0)
}
