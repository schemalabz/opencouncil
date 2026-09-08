import fs from 'fs';
import path from 'path';
import { assertLocalTarget } from './target-guard';
import { POST_RESTORE_FILE, unpackArtifact } from './artifact';
import { binary, prismaMigrate, psqlFile, run } from './process';

export type RestoreOptions = {
    tarPath: string;
    databaseUrl: string;
    /** prisma/schema.prisma of the checkout or of the packaged pipeline. */
    schemaPath: string;
    workDir: string;
};

/**
 * The one consumer flow: an empty database, the artifact's schema and data,
 * the constraints the dump cannot carry, then `prisma migrate deploy`, which is
 * a no-op on main and applies only a branch's own migrations. Returns the
 * directory that holds the unpacked dump.
 *
 * Each restore unpacks into its own directory in `workDir`, so two restores that
 * share a work directory cannot replace the files that the other one reads.
 */
export async function restoreArtifact(o: RestoreOptions): Promise<string> {
    assertLocalTarget(o.databaseUrl);
    fs.mkdirSync(o.workDir, { recursive: true });
    const dir = await unpackArtifact(o.tarPath, fs.mkdtempSync(path.join(o.workDir, 'artifact-')));
    await run(binary('pg_restore'), ['--no-owner', '--no-privileges', '--exit-on-error', '-d', o.databaseUrl, dir]);
    await psqlFile(o.databaseUrl, path.join(dir, POST_RESTORE_FILE));
    await prismaMigrate(o.databaseUrl, o.schemaPath, ['deploy']);
    return dir;
}
