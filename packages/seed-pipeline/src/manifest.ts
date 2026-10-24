import fs from 'fs';
import path from 'path';
import * as z from 'zod';

export const MANIFEST_FILE = 'manifest.json';

const selectedMeeting = z.object({
    cityId: z.string(),
    meetingId: z.string(),
    administrativeBodyId: z.string().nullable(),
    pinned: z.boolean(),
});
export type SelectedMeeting = z.output<typeof selectedMeeting>;

// Both name files in the download cache, so neither may hold a path.
const fileInfo = z.object({
    name: z.string().refine((name) => name === path.basename(name) && name !== '.' && name !== '..', 'must be a file name, not a path'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hex characters'),
    bytes: z.number(),
});
export type FileInfo = z.output<typeof fileInfo>;

export const manifestSchema = z.object({
    producedAt: z.string(),
    backup: z.object({ path: z.string(), date: z.string() }),
    migrationHead: z.string().nullable(),
    greenmaskVersion: z.string(),
    meetingsPerBody: z.number(),
    cities: z.array(z.string()),
    meetings: z.array(selectedMeeting),
    /** Expected rows per table in the subset; private tables appear with 0. */
    counts: z.record(z.string(), z.number()),
    files: z.object({ subset: fileInfo, full: fileInfo }),
});
export type Manifest = z.output<typeof manifestSchema>;

export function writeManifest(dir: string, manifest: Manifest): void {
    fs.writeFileSync(path.join(dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
}

/** Parse manifest JSON from `source`, a file or a URL. A manifest of another shape fails here, not later. */
export function parseManifest(json: string, source: string): Manifest {
    const parsed = manifestSchema.safeParse(JSON.parse(json));
    if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
        throw new Error(`${source} is not a valid manifest: ${issues}`);
    }
    return parsed.data;
}

/** Read the manifest of an artifact directory. */
export function readManifest(dir: string): Manifest {
    const file = path.join(dir, MANIFEST_FILE);
    return parseManifest(fs.readFileSync(file, 'utf8'), file);
}
