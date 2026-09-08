import { Transform, TransformCallback } from 'stream';
import { StringDecoder } from 'string_decoder';

export type FilterStats = {
    kept: Record<string, number>;
    dropped: Record<string, number>;
    foreignKeyStatements: string[];
};

export type FilterOptions = {
    /** Tables whose COPY data passes through. */
    allow: Set<string>;
    /** Every table the classification knows. A COPY for any other public table is an error. */
    known: Set<string>;
};

const COPY_LINE = /^COPY ([A-Za-z0-9_]+)\.("?)([A-Za-z0-9_]+)\2 /;
const ALTER_TABLE_LINE = /^ALTER TABLE ONLY public\."?[A-Za-z0-9_]+"?$/;
const ADD_FOREIGN_KEY_LINE = /^\s+ADD CONSTRAINT .* FOREIGN KEY /;
const COPY_END = '\\.';

/**
 * Line filter over a plain-format pg_dump. Every statement passes through; the
 * COPY data block of a table outside `allow` is dropped. Tables that start with
 * "_" are Prisma join tables and are dropped unless allowed. A COPY for a public
 * table outside `known` aborts the stream: the classification must name it first.
 * A COPY header the pattern cannot parse aborts it too.
 * Foreign-key ALTER statements are recorded, because the ones whose target rows
 * were dropped fail during the restore and must be re-applied after nulling.
 */
export class ContentFilter extends Transform {
    readonly stats: FilterStats = { kept: {}, dropped: {}, foreignKeyStatements: [] };
    // The unfinished last line, in the pieces it arrived in. A COPY line of TaskStatus
    // runs to 14 MB, which arrives as hundreds of chunks. Joining and splitting the
    // whole line again on every chunk is quadratic in its length, so the pieces are
    // joined once, when the chunk that ends the line arrives.
    private pieces: string[] = [];
    private dropping: string | null = null;
    private keeping: string | null = null;
    private pendingAlter: string | null = null;
    // A Buffer chunk boundary can fall inside a multi-byte UTF-8 character (Greek text is
    // everywhere in this data). StringDecoder holds back an incomplete trailing sequence
    // until the next write() supplies its remaining bytes, instead of decoding it in place.
    private readonly decoder = new StringDecoder('utf8');

    constructor(private readonly opts: FilterOptions) {
        super();
    }

    _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
        const text = this.decoder.write(chunk);
        this.pieces.push(text);
        if (!text.includes('\n')) {
            callback(null);
            return;
        }
        const lines = this.pieces.join('').split('\n');
        this.pieces = [lines.pop() ?? ''];
        callback(this.consume(lines));
    }

    _flush(callback: TransformCallback): void {
        const remainder = this.pieces.join('') + this.decoder.end();
        this.pieces = [];
        const error = remainder ? this.consume([remainder]) : null;
        callback(error);
    }

    private consume(lines: string[]): Error | null {
        const out: string[] = [];
        for (const line of lines) {
            const error = this.handleLine(line, out);
            if (error) return error;
        }
        if (out.length) this.push(out.join('\n') + '\n');
        return null;
    }

    private handleLine(line: string, out: string[]): Error | null {
        if (this.dropping) {
            if (line === COPY_END) this.dropping = null;
            else this.stats.dropped[this.dropping] += 1;
            return null;
        }
        if (this.keeping) {
            if (line === COPY_END) this.keeping = null;
            else this.stats.kept[this.keeping] += 1;
            out.push(line);
            return null;
        }
        const copy = COPY_LINE.exec(line);
        if (copy) {
            const schema = copy[1];
            const table = copy[3];
            const isJoinTable = table.startsWith('_');
            if (schema === 'public' && !isJoinTable && !this.opts.known.has(table)) {
                return new Error(`backup contains unknown table "${table}"; classify it in tables.json first`);
            }
            if (schema === 'public' && this.opts.allow.has(table)) {
                this.keeping = table;
                this.stats.kept[table] = 0;
                out.push(line);
            } else {
                this.dropping = table;
                this.stats.dropped[table] = 0;
            }
            return null;
        }
        // A COPY header the pattern cannot read (e.g. a quoted name with a "-") would
        // otherwise pass through with its rows, unclassified.
        if (line.startsWith('COPY ')) {
            return new Error(`backup contains a COPY statement the filter cannot parse: ${line}`);
        }
        if (ALTER_TABLE_LINE.test(line)) {
            this.pendingAlter = line;
        } else if (this.pendingAlter && ADD_FOREIGN_KEY_LINE.test(line)) {
            this.stats.foreignKeyStatements.push(`${this.pendingAlter} ${line.trim()}`);
            this.pendingAlter = null;
        } else {
            this.pendingAlter = null;
        }
        out.push(line);
        return null;
    }
}
