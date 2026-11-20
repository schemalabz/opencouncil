/** @jest-environment node */
import { readdirSync } from 'fs';
import path from 'path';
import { PUBLIC_DIRS, PUBLIC_ROOT_FILES, dottedPathVerdict } from '../dottedPaths';

const publicDir = path.join(__dirname, '../../../public');
const appDir = path.join(__dirname, '../../app');

function publicFiles(dir = publicDir): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? publicFiles(full) : [full];
    });
}

describe('dottedPathVerdict', () => {
    it.each([
        '/',
        '/athens',
        '/en/athens/jun26_2026',
        '/athens/jun26_2026/subjects/abc/opengraph-image',
        '/wp-admin',
    ])('has no verdict for %s, which has no dot', (pathname) => {
        expect(dottedPathVerdict(pathname)).toBeNull();
    });

    it.each([
        '/robots.txt',
        '/sitemap.xml',
        '/manifest.webmanifest',
        '/favicon.ico',
        '/sw.js',
        '/fonts/RobotoMono.woff2',
        '/about/shots/manifest.json',
        // Video links pasted after the domain; next.config.mjs rewrites them.
        '/youtu.be/dQw4w9WgXcQ',
        '/www.youtube.com/watch',
        '/https:/youtu.be/dQw4w9WgXcQ',
        '/http:/m.youtube.com/watch',
        '/HTTPS:/YouTu.be/dQw4w9WgXcQ',
        '/consultations/abc/regulation.json',
        '/yt/youtu.be/dQw4w9WgXcQ',
        '/qr/spring.2026',
    ])('lets %s through', (pathname) => {
        expect(dottedPathVerdict(pathname)).toBe('serve');
    });

    it.each([
        '/.env',
        '/.env.production',
        '/.git/config',
        '/.aws/credentials',
        '/.well-known/security.txt',
        '/config.json',
        '/config/initializers/stripe.rb',
        '/wp-login.php',
        '/x/.aws/credentials',
        '/en/.env',
        '/athens/terraform.tfvars',
        '/apple-touch-icon.png',
        // A public directory serves files of known types only.
        '/about/.env',
        '/fonts/config.php',
        '/og/.git/config',
        // A video host must be the first segment, or the one after the scheme.
        '/x/youtu.be/dQw4w9WgXcQ',
        '/https:/example.com/watch',
        '/robots.txt/x',
    ])('rejects %s', (pathname) => {
        expect(dottedPathVerdict(pathname)).toBe('reject');
    });
});

/**
 * The lists are written by hand. A file that someone adds to `public/` and
 * that the lists do not cover would get a 404 from the proxy.
 */
describe('the lists cover public/', () => {
    it('serves every file in public/', () => {
        const rejected = publicFiles()
            .map(file => '/' + path.relative(publicDir, file).split(path.sep).join('/'))
            .filter(pathname => dottedPathVerdict(pathname) !== 'serve');

        expect(rejected).toEqual([]);
    });

    it('lists every entry of public/', () => {
        const entries = readdirSync(publicDir, { withFileTypes: true });

        expect(PUBLIC_DIRS).toEqual(expect.arrayContaining(entries.filter(e => e.isDirectory()).map(e => e.name)));
        expect([...PUBLIC_ROOT_FILES].sort()).toEqual(entries.filter(e => !e.isDirectory()).map(e => e.name).sort());
    });

    // A metadata file of Next (`icon.png`, `opengraph-image.png`, a second
    // sitemap) has a URL with a dot. Add it to METADATA_FILES with the file.
    it('knows the metadata routes of src/app', () => {
        const names = readdirSync(appDir).filter(name => /^(robots|sitemap|manifest|icon|apple-icon|favicon|opengraph-image|twitter-image)\./.test(name));

        expect(names.sort()).toEqual(['manifest.ts', 'robots.ts', 'sitemap.ts']);
    });

    // A route outside `[locale]` gets no locale routing, and the proxy must
    // know its first segment: the matcher skips `api`, and DOTTED_PARAM_ROUTES
    // names `qr` and `yt`.
    it('knows the routes of src/app outside [locale]', () => {
        const dirs = readdirSync(appDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);

        expect(dirs.sort()).toEqual(['[locale]', '__tests__', 'api', 'qr', 'yt']);
    });
});
