import fs from 'fs';
import path from 'path';
import readline from 'readline';
import zlib from 'zlib';

type Counts = { emails: number; phones: number; callbackTokens: number };

export type ScanReport = {
    perTable: Record<string, Counts>;
    /** Tables with an email or a phone match that are not declared public text, and every table with a callback token. */
    violations: string[];
};

type MetadataEntry = { objectType: string; name: string; fileName: string };

// ASCII-only and intentionally broad: this is a heuristic gate, not an email validator.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/**
 * Greek mobile (69…) and landline (2…) numbers of ten digits, with or without
 * the country prefix, and with spaces between digit groups. A dash is not
 * accepted as a separator: a timestamp such as 2026-10-09 12:00 would match.
 * The negative lookbehind stops a run of digits inside a larger token from
 * matching: a float such as 23.6912345678, or a geometry hex string such as
 * 0101...AB97DF6932004340. A dot after a letter still allows a match, as in
 * `τηλ.6912345678`. `\w` is ASCII-only without the `u` flag, so a Greek letter
 * before the number still allows a match.
 */
const PHONE = /(?:\+30\s?|(?<!\w|\d\.))(?:69\d|2\d\d)(?: ?\d){7}\b/g;

/**
 * A task callback URL with its token. The token unlocks the callback of that task
 * on production, so it is a violation in every table, public text included.
 */
const CALLBACK_TOKEN = /\/taskStatuses\/[^/?\s"]+\?token=[0-9a-f]{64}/g;

/** COPY text writes a newline, a tab, or a carriage return inside a value as `\n`, `\t`, or `\r`. */
const COPY_ESCAPE = /\\[ntr]/g;

function countMatches(line: string, re: RegExp): number {
    return (line.match(re) ?? []).length;
}

/** Reads and counts a table's dump file, rejecting with the file name if it is missing or not valid gzip. */
async function scanFile(file: string): Promise<Counts> {
    const totals: Counts = { emails: 0, phones: 0, callbackTokens: 0 };
    const read = fs.createReadStream(file);
    const gunzip = zlib.createGunzip();

    await new Promise<void>((resolve, reject) => {
        let settled = false;
        const fail = (err: Error) => {
            if (settled) return;
            settled = true;
            read.destroy();
            gunzip.destroy();
            reject(new Error(`Failed to scan ${file}: ${err.message}`, { cause: err }));
        };

        read.on('error', fail);
        gunzip.on('error', fail);

        const lines = readline.createInterface({ input: read.pipe(gunzip), crlfDelay: Infinity });
        // readline re-emits the input stream's error on itself; without a
        // listener here Node treats it as an unhandled 'error' event.
        lines.on('error', fail);
        lines.on('line', (line) => {
            // `City.geometry` and `Location.coordinates` are hex strings, and one
            // line of them runs to hundreds of thousands of characters. The email
            // regex backtracks quadratically over such a long alphanumeric run.
            // Each regex therefore runs only when the line holds the literal
            // characters its match needs.
            if (line.includes('@')) totals.emails += countMatches(line, EMAIL);
            // The escape letter would read as a word character before a number that starts a line of a value.
            totals.phones += countMatches(line.replace(COPY_ESCAPE, ' '), PHONE);
            if (line.includes('token=')) totals.callbackTokens += countMatches(line, CALLBACK_TOKEN);
        });
        lines.on('close', () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        });
    });

    return totals;
}

/** Scan every table data file of a Greenmask dump directory. */
export async function scanDumpDir(dir: string, publicText: Set<string>): Promise<ScanReport> {
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8')) as { entries: MetadataEntry[] };
    const perTable: Record<string, Counts> = {};
    const violations = new Set<string>();
    for (const entry of metadata.entries) {
        if (entry.objectType !== 'TABLE DATA') continue;
        const table = entry.name.replace(/^"|"$/g, '');
        const totals = await scanFile(path.join(dir, entry.fileName));
        // A table can have more than one TABLE DATA entry; add rather than overwrite.
        const running = perTable[table] ?? { emails: 0, phones: 0, callbackTokens: 0 };
        running.emails += totals.emails;
        running.phones += totals.phones;
        running.callbackTokens += totals.callbackTokens;
        perTable[table] = running;
        if ((running.emails > 0 || running.phones > 0) && !publicText.has(table)) violations.add(table);
        if (running.callbackTokens > 0) violations.add(table);
    }
    return { perTable, violations: [...violations].sort() };
}
