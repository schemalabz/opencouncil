import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

const PRIVATE_MODULES = [
    'src/lib/auth.ts',
    'src/lib/db/notifications.ts',
    'src/lib/notifications/bird.ts',
    'src/lib/notifications/content.ts',
    'src/lib/notifications/deliver.ts',
    'src/lib/notifications/matching.ts',
    'src/lib/notifications/tokens.ts',
    'src/lib/notifications/welcome.ts',
];

const ACTION_MODULES: Record<string, string[]> = {
    'src/lib/actions/auth.ts': ['isUserAuthorizedToEdit'],
    'src/lib/actions/notifications.ts': [
        'getUserPreferences',
        'saveNotificationPreferences',
        'savePetition',
    ],
};

const CLIENT_ROOTS = [
    'src/app',
    'src/components',
    'src/contexts',
    'src/hooks',
];

const PRIVATE_RUNTIME_IMPORTS = PRIVATE_MODULES.map(relativePath =>
    `@/${relativePath.replace(/^src\//, '').replace(/\.[^.]+$/, '')}`,
);

function read(relativePath: string): string {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function findSourceFiles(relativeDir: string, files: string[] = []): string[] {
    const absoluteDir = path.join(ROOT, relativeDir);
    if (!fs.existsSync(absoluteDir)) return files;

    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
        const relativePath = path.join(relativeDir, entry.name);
        if (entry.isDirectory()) {
            findSourceFiles(relativePath, files);
        } else if (/\.[jt]sx?$/.test(entry.name)) {
            files.push(relativePath);
        }
    }

    return files;
}

function isClientModule(source: string): boolean {
    return source.split('\n').slice(0, 3).some(line => /^\s*['"]use client['"];?/.test(line));
}

describe('Server Action boundaries', () => {
    it.each(PRIVATE_MODULES)('%s stays private and server-only', relativePath => {
        const source = read(relativePath);
        expect(source).toMatch(/^import ['"]server-only['"];?/);
        expect(source).not.toMatch(/^\s*['"]use server['"];?/m);
    });

    it.each(Object.entries(ACTION_MODULES))(
        '%s exposes only the reviewed actions',
        (relativePath, expectedExports) => {
            const source = read(relativePath);
            expect(source).toMatch(/^['"]use server['"];?/);

            const exports = Array.from(
                source.matchAll(/^export async function (\w+)/gm),
                match => match[1],
            );
            expect([...exports].sort()).toEqual([...expectedExports].sort());
        },
    );

    it('keeps private modules out of client runtime imports', () => {
        const violations: string[] = [];
        const sourceFiles = CLIENT_ROOTS.flatMap(root => findSourceFiles(root));

        for (const relativePath of sourceFiles) {
            const source = read(relativePath);
            if (!isClientModule(source)) continue;

            source.split('\n').forEach((line, index) => {
                if (/^\s*import\s+type\b/.test(line)) return;
                const importsPrivateModule = PRIVATE_RUNTIME_IMPORTS.some(
                    moduleName => line.includes(`from '${moduleName}'`) || line.includes(`from "${moduleName}"`),
                );
                if (importsPrivateModule) {
                    violations.push(`${relativePath}:${index + 1}`);
                }
            });
        }

        expect(violations).toEqual([]);
    });
});
