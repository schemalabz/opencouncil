import fs from 'fs';
import path from 'path';
import { z } from 'zod';

export const MANIFEST_FILE = 'manifest.json';

const selectedMeeting = z.object({
    cityId: z.string(),
    meetingId: z.string(),
    administrativeBodyId: z.string().nullable(),
    pinned: z.boolean(),
});
export type SelectedMeeting = z.infer<typeof selectedMeeting>;

const fileInfo = z.object({ name: z.string(), sha256: z.string(), bytes: z.number() });
export type FileInfo = z.infer<typeof fileInfo>;

export const manifestSchema = z.object({
    producedAt: z.string(),
    backup: z.object({ path: z.string(), date: z.string() }),
    migrationHead: z.string().nullable(),
    greenmaskVersion: z.string(),
    meetingsPerBody: z.number(),
    cities: z.array(z.string()),
    meetings: z.array(selectedMeeting),
    /** Expected rows per table in the subset; private tables appear with 0. */
    counts: z.record(z.number()),
    files: z.object({ subset: fileInfo, full: fileInfo }),
});
export type Manifest = z.infer<typeof manifestSchema>;

export function writeManifest(dir: string, manifest: Manifest): void {
    fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
}

/** Read the manifest of an artifact directory. A manifest of another shape fails here, not later. */
export function readManifest(dir: string): Manifest {
    const file = path.join(dir, MANIFEST_FILE);
    const parsed = manifestSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
        throw new Error(`${file} is not a valid manifest: ${issues}`);
    }
    return parsed.data;
}
