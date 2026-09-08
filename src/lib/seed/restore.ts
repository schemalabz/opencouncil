import path from 'path';
import { assertLocalTarget } from './target-guard';
import { POST_RESTORE_FILE, unpackArtifact } from '@/lib/seed-pipeline/artifact';
import { binary, prismaMigrate, psqlFile, run } from '@/lib/seed-pipeline/process';

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
 * a no-op on main and applies only a branch's own migrations.
 */
export async function restoreArtifact(o: RestoreOptions): Promise<void> {
    assertLocalTarget(o.databaseUrl);
    const dir = await unpackArtifact(o.tarPath, path.join(o.workDir, 'artifact'));
    await run(binary('pg_restore'), ['--no-owner', '--no-privileges', '--exit-on-error', '-d', o.databaseUrl, dir]);
    await psqlFile(o.databaseUrl, path.join(dir, POST_RESTORE_FILE));
    await prismaMigrate(o.databaseUrl, o.schemaPath, ['deploy']);
}
