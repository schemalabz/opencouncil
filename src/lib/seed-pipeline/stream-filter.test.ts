import { ContentFilter } from './stream-filter';

async function runFilter(input: string, allow: string[], known: string[]): Promise<{ output: string; filter: ContentFilter }> {
    const filter = new ContentFilter({ allow: new Set(allow), known: new Set(known) });
    const chunks: Buffer[] = [];
    filter.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve, reject) => {
        filter.on('end', resolve);
        filter.on('error', reject);
    });
    // Feed in two chunks that split a line, to exercise the line buffer.
    const middle = Math.floor(input.length / 2);
    filter.write(input.slice(0, middle));
    filter.write(input.slice(middle));
    filter.end();
    await done;
    return { output: Buffer.concat(chunks).toString('utf8'), filter };
}

const DUMP = [
    'CREATE TABLE public."User" (id text);',
    'COPY public."User" (id, email) FROM stdin;',
    'u1\ta@b.gr',
    'u2\tc@d.gr',
    '\\.',
    'COPY public."City" (id) FROM stdin;',
    'athens',
    '\\.',
    'COPY public._prisma_migrations (id) FROM stdin;',
    'm1',
    '\\.',
    'COPY public."_NotificationTopic" ("A", "B") FROM stdin;',
    'x\ty',
    '\\.',
    'COPY public.spatial_ref_sys (srid) FROM stdin;',
    '4326',
    '\\.',
    'ALTER TABLE ONLY public."Decision"',
    '    ADD CONSTRAINT "Decision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;',
    'ALTER TABLE ONLY public."City"',
    '    ADD CONSTRAINT "City_pkey" PRIMARY KEY (id);',
    'SELECT 1;',
    '',
].join('\n');

describe('ContentFilter', () => {
    test('keeps allowed COPY blocks, drops the rest, keeps every statement', async () => {
        const { output, filter } = await runFilter(DUMP, ['City', '_prisma_migrations'], ['User', 'City', 'spatial_ref_sys', '_prisma_migrations']);
        expect(output).toContain('CREATE TABLE public."User" (id text);');
        expect(output).toContain('COPY public."City" (id) FROM stdin;\nathens\n\\.');
        expect(output).toContain('COPY public._prisma_migrations (id) FROM stdin;\nm1\n\\.');
        expect(output).not.toContain('a@b.gr');
        expect(output).not.toContain('x\ty');
        expect(output).not.toContain('4326');
        expect(output).toContain('SELECT 1;');
        expect(filter.stats.kept).toEqual({ City: 1, _prisma_migrations: 1 });
        expect(filter.stats.dropped).toEqual({ User: 2, _NotificationTopic: 1, spatial_ref_sys: 1 });
    });

    test('records foreign-key statements as single lines', async () => {
        const { filter } = await runFilter(DUMP, ['City'], ['User', 'City', 'spatial_ref_sys']);
        expect(filter.stats.foreignKeyStatements).toEqual([
            'ALTER TABLE ONLY public."Decision" ADD CONSTRAINT "Decision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;',
        ]);
    });

    test('fails on a COPY for a table the classification does not know', async () => {
        await expect(runFilter(DUMP, ['City'], ['City'])).rejects.toThrow(/unknown table "User"/);
    });

    test.each([
        ['a quoted name with a character outside the pattern', 'COPY public."user-log" (id, email) FROM stdin;'],
        ['a quoted schema', 'COPY "Notis"."Sub" (id) FROM stdin;'],
        ['a non-ASCII name', 'COPY public."Χρήστης" (id) FROM stdin;'],
    ])('aborts on a COPY header it cannot parse: %s', async (_case, header) => {
        const dump = [header, 'u1\ta@b.gr', '\\.', ''].join('\n');
        await expect(runFilter(dump, ['City'], ['City'])).rejects.toThrow(/cannot parse/);
    });

    test('gives the same output and counts whatever the chunk size, also for a line much longer than a chunk', async () => {
        const long = 'x'.repeat(200_000) + 'Αθήνα'.repeat(5_000);
        const dump = ['COPY public."City" (id, name) FROM stdin;', `athens\t${long}`, 'patras\tΠάτρα', '\\.', 'COPY public."User" (id) FROM stdin;', 'u1', '\\.', 'SELECT 1;'].join('\n');
        const run = async (chunkSize: number) => {
            const filter = new ContentFilter({ allow: new Set(['City']), known: new Set(['City', 'User']) });
            const out: Buffer[] = [];
            filter.on('data', (c: Buffer) => out.push(c));
            const done = new Promise<void>((resolve, reject) => { filter.on('end', resolve); filter.on('error', reject); });
            const bytes = Buffer.from(dump, 'utf8');
            for (let i = 0; i < bytes.length; i += chunkSize) filter.write(bytes.subarray(i, i + chunkSize));
            filter.end();
            await done;
            return { output: Buffer.concat(out).toString('utf8'), stats: filter.stats };
        };
        const whole = await run(Buffer.byteLength(dump));
        expect(whole.output).toContain(`athens\t${long}\npatras\tΠάτρα\n`);
        expect(whole.stats.kept).toEqual({ City: 2 });
        expect(whole.stats.dropped).toEqual({ User: 1 });
        // 7 bytes splits most Greek characters; 16 KiB is zlib's default chunk.
        for (const size of [7, 1000, 16 * 1024]) expect(await run(size)).toEqual(whole);
    });

    test('keeps the final line when the input has no trailing newline', async () => {
        // DUMP ends with an empty array entry, which join('\n') turns into a trailing newline.
        // Strip it so 'SELECT 1;' is the last line with nothing after it.
        const noTrailingNewlineDump = DUMP.replace(/\n$/, '');
        const { output } = await runFilter(
            noTrailingNewlineDump,
            ['City', '_prisma_migrations'],
            ['User', 'City', 'spatial_ref_sys', '_prisma_migrations'],
        );
        expect(output).toContain('SELECT 1;');
    });

    test('does not corrupt a multi-byte UTF-8 character split across a chunk boundary', async () => {
        const text = [
            'COPY public."City" (id, name) FROM stdin;',
            'athens\tΑθήνα',
            '\\.',
            '',
        ].join('\n');
        const buffer = Buffer.from(text, 'utf8');
        // 'Α' (U+0391) encodes as two UTF-8 bytes. Split right after its first byte, so
        // one chunk ends with a dangling lead byte and the next starts with the orphaned
        // continuation byte.
        const greekStart = buffer.indexOf('Α', 0, 'utf8');
        const splitAt = greekStart + 1;

        const filter = new ContentFilter({ allow: new Set(['City']), known: new Set(['City']) });
        const chunks: Buffer[] = [];
        filter.on('data', (c: Buffer) => chunks.push(c));
        const done = new Promise<void>((resolve, reject) => {
            filter.on('end', resolve);
            filter.on('error', reject);
        });
        filter.write(buffer.subarray(0, splitAt));
        filter.write(buffer.subarray(splitAt));
        filter.end();
        await done;

        const output = Buffer.concat(chunks).toString('utf8');
        expect(output).toContain('Αθήνα');
        expect(output).not.toContain('�');
    });
});
