/**
 * Shared CSV helpers for dev scripts, built on the csv-parser dependency the
 * repo already uses (insert_people.ts etc.) instead of hand-rolled parsing.
 */
import fs from "fs";
import csv from "csv-parser";

/** Parse a CSV file with a header row into trimmed string records. */
export function parseCsvFile(filePath: string): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
        const rows: Record<string, string>[] = [];
        fs.createReadStream(filePath)
            .pipe(
                csv({
                    mapHeaders: ({ header }) => header.trim(),
                    mapValues: ({ value }) => String(value).trim(),
                })
            )
            .on("data", (row: Record<string, string>) => rows.push(row))
            .on("end", () => resolve(rows))
            .on("error", reject);
    });
}

// ── Value converters for CSV columns ("NULL"/"null"/"" mean null) ──────────

function isNull(val: string | undefined): boolean {
    return val === undefined || val === "" || val === "NULL" || val === "null";
}

export function toStringOrNull(val: string | undefined): string | null {
    return isNull(val) ? null : val!;
}

export function toFloat(val: string): number {
    const n = parseFloat(val);
    if (isNaN(n)) throw new Error(`Expected number, got "${val}"`);
    return n;
}

export function toFloatOrNull(val: string | undefined): number | null {
    return isNull(val) ? null : toFloat(val!);
}

export function toIntOrNull(val: string | undefined): number | null {
    if (isNull(val)) return null;
    const n = parseInt(val!, 10);
    if (isNaN(n)) throw new Error(`Expected integer, got "${val}"`);
    return n;
}

export function toBool(val: string | undefined): boolean {
    const lower = (val ?? "").toLowerCase();
    return lower === "true" || lower === "t" || lower === "1";
}

export function toDate(val: string): Date {
    const d = new Date(val);
    if (isNaN(d.getTime())) throw new Error(`Invalid date: "${val}"`);
    return d;
}
