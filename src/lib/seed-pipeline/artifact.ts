import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { run } from './process';

export const POST_RESTORE_FILE = 'post-restore.sql';

export async function sha256File(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        fs.createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
    });
}

/** Greenmask names each dump directory by a millisecond timestamp. */
export function newestDumpDir(storageDir: string): string {
    const numeric = fs
        .readdirSync(storageDir)
        .filter((n) => /^\d+$/.test(n) && fs.statSync(path.join(storageDir, n)).isDirectory())
        .sort((a, b) => Number(a) - Number(b));
    if (numeric.length === 0) throw new Error(`no dump directory under ${storageDir}`);
    return path.join(storageDir, numeric[numeric.length - 1]);
}

// One process, one exit code: a shell pipeline (`tar | zstd`) reports only the
// last command's status, so a missing `tar` would leave an empty zstd frame
// and still report success. GNU tar runs the compression program itself
// but surfaces tar's own exit code.
export async function packArtifact(o: { dumpDir: string; postRestoreSql: string[]; outFile: string }): Promise<{ sha256: string; bytes: number }> {
    const header = '-- Re-adds the constraints the dump cannot carry. Run after pg_restore, before prisma migrate deploy.\n';
    fs.writeFileSync(path.join(o.dumpDir, POST_RESTORE_FILE), header + o.postRestoreSql.join('\n') + '\n');
    // zstd on every core: the data files are gzip already, so level 3 gains little more.
    await run('tar', ['--use-compress-program', 'zstd -T0 -3', '-C', o.dumpDir, '-cf', o.outFile, '.']);

    const listing = await run('tar', ['--zstd', '-tf', o.outFile]);
    const hasToc = listing.stdout.split('\n').some((line) => line === 'toc.dat' || line === './toc.dat');
    if (!hasToc) throw new Error(`${o.outFile} does not contain toc.dat: packing produced an empty or incomplete archive`);

    return { sha256: await sha256File(o.outFile), bytes: fs.statSync(o.outFile).size };
}

/** Delete targetDir if it exists, then unpack into it and return it. */
export async function unpackArtifact(tarFile: string, targetDir: string): Promise<string> {
    // Clear any leftover archive from a previous restore into the same workDir,
    // so a stale toc.dat cannot make this unpack look complete when it is not.
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
    await run('tar', ['--zstd', '-xf', tarFile, '-C', targetDir]);
    if (!fs.existsSync(path.join(targetDir, 'toc.dat'))) throw new Error(`${tarFile} does not contain a pg_dump directory archive`);
    return targetDir;
}
