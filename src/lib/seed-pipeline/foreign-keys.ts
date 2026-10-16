export type ForeignKey = {
    table: string;
    constraint: string;
    columns: string[];
    refTable: string;
    refColumns: string[];
    /** The text after ADD CONSTRAINT "<name>", usable in a new ADD CONSTRAINT. */
    definition: string;
    /** The original single-line statement, re-run verbatim when the restore skipped it. */
    statement: string;
};

const FK_STATEMENT = /^ALTER TABLE ONLY public\."?([A-Za-z0-9_]+)"?\s+ADD CONSTRAINT "?([A-Za-z0-9_]+)"? (FOREIGN KEY \(([^)]+)\) REFERENCES public\."?([A-Za-z0-9_]+)"?\(([^)]+)\)[^;]*);?$/;

function splitColumns(list: string): string[] {
    return list.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
}

export function parseForeignKeyStatement(statement: string): ForeignKey | null {
    const match = FK_STATEMENT.exec(statement.trim());
    if (!match) return null;
    return {
        table: match[1],
        constraint: match[2],
        definition: match[3].trim(),
        columns: splitColumns(match[4]),
        refTable: match[5],
        refColumns: splitColumns(match[6]),
        statement: statement.trim(),
    };
}

/** Keys from included tables that point at tables outside `included`. */
export function orphanForeignKeys(fks: ForeignKey[], included: Set<string>): ForeignKey[] {
    return fks.filter((fk) => included.has(fk.table) && !included.has(fk.refTable));
}
