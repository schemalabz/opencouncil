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

/**
 * A line of a COPY text dump as the text it holds, for matching. COPY writes a
 * backslash as `\\`, a null field as `\N`, and a newline, a tab, or another
 * control character inside a value as an escape such as `\n`. Undecoded, the
 * escape letter joins the next word: `\nadmin@example.org` would match as
 * `nadmin@example.org`, and `\n6912345678` would not match as a phone. So every
 * control escape becomes a space.
 */
export function scannableText(line: string): string {
    if (!line.includes('\\')) return line;
    return line.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|[\s\S])/g, (_, escape: string) => {
        if (escape === '\\') return '\\';
        if (escape === 'N') return '';
        if (/^[bfnrtv]$|^x|^[0-7]/.test(escape)) return ' ';
        return escape;
    });
}

function countMatches(line: string, re: RegExp): number {
    return (line.match(re) ?? []).length;
}

/** Reads every line of a table's dump file, rejecting with the file name if it is missing or not valid gzip. */
async function forEachLine(file: string, onLine: (line: string) => void): Promise<void> {
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
        lines.on('line', onLine);
        lines.on('close', () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        });
    });
}

/** Counts the matches of a table's dump file. */
async function scanFile(file: string): Promise<Counts> {
    const totals: Counts = { emails: 0, phones: 0, callbackTokens: 0 };
    await forEachLine(file, (line) => {
        const text = scannableText(line);
        // `City.geometry` and `Location.coordinates` are hex strings, and one
        // line of them runs to hundreds of thousands of characters. The email
        // regex backtracks quadratically over such a long alphanumeric run.
        // Each regex therefore runs only when the line holds the literal
        // characters its match needs.
        if (text.includes('@')) totals.emails += countMatches(text, EMAIL);
        totals.phones += countMatches(text, PHONE);
        if (text.includes('token=')) totals.callbackTokens += countMatches(text, CALLBACK_TOKEN);
    });
    return totals;
}

function tableDataEntries(dir: string): Array<{ table: string; file: string }> {
    const metadata = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8')) as { entries: MetadataEntry[] };
    return metadata.entries
        .filter((entry) => entry.objectType === 'TABLE DATA')
        .map((entry) => ({ table: entry.name.replace(/^"|"$/g, ''), file: path.join(dir, entry.fileName) }));
}

/**
 * Per table, the number of email-like strings in a dump directory that are one of
 * `accountEmails` (lowercase): the emails of the backup's accounts. Unlike the
 * pattern scan, this has no public-text exemption: an account's address in public
 * text is still an account's address, so a person must look at it.
 */
export async function countAccountEmails(dir: string, accountEmails: ReadonlySet<string>): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const { table, file } of tableDataEntries(dir)) {
        await forEachLine(file, (line) => {
            if (!line.includes('@')) return;
            for (const match of scannableText(line).match(EMAIL) ?? []) {
                if (accountEmails.has(match.toLowerCase())) counts[table] = (counts[table] ?? 0) + 1;
            }
        });
    }
    return counts;
}

/** Scan every table data file of a Greenmask dump directory. */
export async function scanDumpDir(dir: string, publicText: Set<string>): Promise<ScanReport> {
    const perTable: Record<string, Counts> = {};
    const violations = new Set<string>();
    for (const { table, file } of tableDataEntries(dir)) {
        const totals = await scanFile(file);
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
