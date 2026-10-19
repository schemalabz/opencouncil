import fs from 'fs';
import path from 'path';

/**
 * Architecture guard: a read outside src/lib/tasks never loads the whole
 * administrative body row. The row holds the settings of the municipality
 * (contact emails, Diavgeia units, conventions). A public read includes the
 * relation with `publicAdministrativeBodyRelation`, and an editor reads the
 * settings through the guarded readers in src/lib/db/administrativeBodies.ts.
 *
 * The task modules build server-to-server requests and may load the row.
 * tests/integration/public-administrative-body.test.ts checks the known reads
 * at runtime. This test catches a new read that writes `administrativeBody: true`.
 */

const SRC = path.join(process.cwd(), 'src');
const ALLOWED_PREFIX = path.join('src', 'lib', 'tasks') + path.sep;
const FULL_ROW = /\badministrativeBod(?:y|ies)\s*:\s*true\b/;

function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
        return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
}

describe('administrative body boundary', () => {
    it('loads the whole administrative body row only in src/lib/tasks', () => {
        const offenders = sourceFiles(SRC)
            .map(file => path.relative(process.cwd(), file))
            .filter(file => !file.startsWith(ALLOWED_PREFIX))
            .filter(file => FULL_ROW.test(fs.readFileSync(file, 'utf8')));

        expect(offenders).toEqual([]);
    });

    it('sees the task modules that load the row, so the scan reads the files', () => {
        const taskReads = sourceFiles(path.join(SRC, 'lib', 'tasks'))
            .filter(file => FULL_ROW.test(fs.readFileSync(file, 'utf8')));

        expect(taskReads.length).toBeGreaterThan(0);
    });
});
