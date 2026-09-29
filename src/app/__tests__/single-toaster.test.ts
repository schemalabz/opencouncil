import fs from 'fs';
import path from 'path';

/**
 * Architecture guard: the app mounts exactly one <Toaster />, in the root
 * layout. Every Toaster reads the same module-level toast store
 * (packages/ui/src/hooks/use-toast.ts), so each extra mount renders every
 * toast again: the copies stack on top of each other, and a screen reader
 * announces the message once for each copy.
 *
 * The root layout is the only place above src/app/error.tsx and the
 * [locale] segment. A Toaster there stays mounted when a render error
 * replaces the page and when the locale changes.
 */

const SRC = path.join(process.cwd(), 'src');
const ROOT_LAYOUT = 'src/app/layout.tsx';
// The "use client" re-export of packages/ui/src/toaster.tsx.
const TOASTER_MODULE = 'src/components/ui/toaster.tsx';

const TOASTER_IMPORT = /from\s*['"][^'"]*\/toaster['"]/;
const TOASTER_MOUNT = /<Toaster[\s/>]/g;

function sourceFiles(): string[] {
    return fs.readdirSync(SRC, { recursive: true, encoding: 'utf8' })
        .map(file => path.join('src', file).split(path.sep).join('/'))
        .filter(file => /\.tsx?$/.test(file))
        .filter(file => !file.includes('/__tests__/') && !/\.test\.tsx?$/.test(file));
}

describe('Toaster mount', () => {
    const files = sourceFiles();

    it('finds source files to scan', () => {
        expect(files.length).toBeGreaterThan(100);
    });

    it('imports the Toaster only in the root layout', () => {
        const importers = files.filter(file =>
            file !== TOASTER_MODULE && TOASTER_IMPORT.test(fs.readFileSync(file, 'utf8')));

        expect(importers).toEqual([ROOT_LAYOUT]);
    });

    it('mounts the Toaster once in the root layout', () => {
        const source = fs.readFileSync(path.join(process.cwd(), ROOT_LAYOUT), 'utf8');

        expect(source.match(TOASTER_MOUNT)).toHaveLength(1);
    });
});
