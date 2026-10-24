import { randomUUID } from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { fileFailures } from './artifact';
import { MANIFEST_FILE, parseManifest } from './manifest';
import { formatError } from './errors';

/** Where `seed fetch` finds the published artifacts when no source is given. */
export const DEFAULT_ARTIFACT_URL = 'https://github.com/schemalabz/opencouncil-seed-data/releases/latest/download';

/**
 * Downloads go to the user's cache, not to the checkout, so every clone and
 * worktree on the machine shares them.
 */
export function defaultCacheDir(): string {
    return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'opencouncil', 'seed-artifacts');
}

export type ArtifactKind = 'subset' | 'full';

/** The published artifact cannot be read: no network, no release yet, or a bad URL. */
export class ArtifactUnavailableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ArtifactUnavailableError';
    }
}

/** A temporary file older than this was left by a download that was stopped. */
const STALE_PARTIAL_MS = 24 * 60 * 60 * 1000;

/** An error of this machine's disk, not of the network: the message must not send the reader to the network. */
function isLocalFileError(error: unknown): boolean {
    const syscall = (error as NodeJS.ErrnoException | undefined)?.syscall;
    return syscall === 'open' || syscall === 'write' || syscall === 'close' || syscall === 'rename';
}

/** Write a file under a temporary name and rename it, so a reader never sees it half written. */
function writeFileAtomic(file: string, content: string): void {
    const temporary = `${file}.${process.pid}-${randomUUID().slice(0, 8)}.tmp`;
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, file);
}

export type FetchOptions = {
    /** An archive file, a directory that holds one, or the base URL of a published artifact. */
    from: string;
    kind: ArtifactKind;
    /** Downloads land in `<cacheDir>/<sha256>/`, so a second fetch of the same artifact reads nothing. */
    cacheDir: string;
    log?: (line: string) => void;
};

/** GitHub answers a release download with one redirect, to its object store. */
const MAX_REDIRECTS = 5;
/** A server that sends nothing for this long fails the request instead of stalling it. */
const IDLE_TIMEOUT_MS = 60_000;

/**
 * GETs `url` with the http and https modules, not fetch(): undici's fetch() fails
 * an assertion and stops the process when a server closes the connection at the
 * end of a response, as an HTTP/1.0 server does, and no catch can stop it.
 */
function get(url: string, redirects = 0): Promise<http.IncomingMessage> {
    return new Promise((resolve, reject) => {
        const unavailable = (why: string) => reject(new ArtifactUnavailableError(`${url}: ${why}`));
        const request = (url.startsWith('https:') ? https : http).get(url, (response) => {
            const status = response.statusCode ?? 0;
            const location = response.headers.location;
            if (status >= 300 && status < 400 && location) {
                response.resume();
                if (redirects >= MAX_REDIRECTS) return unavailable(`more than ${MAX_REDIRECTS} redirects`);
                return resolve(get(new URL(location, url).href, redirects + 1));
            }
            if (status !== 200) {
                response.resume();
                return unavailable(`HTTP ${status}`);
            }
            resolve(response);
        });
        request.setTimeout(IDLE_TIMEOUT_MS, () => request.destroy(new Error(`no data for ${IDLE_TIMEOUT_MS / 1000} s`)));
        request.on('error', (error) => unavailable(formatError(error)));
    });
}

async function getText(url: string): Promise<string> {
    const chunks: Buffer[] = [];
    try {
        for await (const chunk of await get(url)) chunks.push(chunk);
    } catch (error) {
        throw error instanceof ArtifactUnavailableError ? error : new ArtifactUnavailableError(`${url}: ${formatError(error)}`, { cause: error });
    }
    return Buffer.concat(chunks).toString('utf8');
}

/**
 * Returns the path of a local archive of `kind` that matches its manifest. A
 * local file or directory is returned as it is; `restore` checks it against the
 * manifest beside it. A URL is the base of a published artifact: its manifest
 * names the archive and its sha256. The archive is downloaded under a temporary
 * name and checked before it takes its real name, so the cache never holds a
 * partial or a wrong file.
 */
export async function fetchArtifact(o: FetchOptions): Promise<string> {
    if (!/^https?:\/\//.test(o.from)) {
        const local = fs.existsSync(o.from) && fs.statSync(o.from).isDirectory() ? path.join(o.from, `${o.kind}.tar.zst`) : o.from;
        if (!fs.existsSync(local)) throw new Error(`${local} does not exist`);
        return local;
    }
    const base = o.from.replace(/\/+$/, '');
    const manifestUrl = `${base}/${MANIFEST_FILE}`;
    const manifestJson = await getText(manifestUrl);
    const info = parseManifest(manifestJson, manifestUrl).files[o.kind];

    const dir = path.join(o.cacheDir, info.sha256);
    const archive = path.join(dir, info.name);
    if (fs.existsSync(archive) && (await fileFailures(dir, info)).length === 0) return archive;

    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(path.join(dir, MANIFEST_FILE), manifestJson);
    // A stopped download leaves its temporary file. Other checkouts share the cache,
    // so only a file old enough to belong to no running download goes.
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.partial'))) {
        const file = path.join(dir, name);
        // Another download can rename its file away between the listing and the stat.
        const stat = fs.statSync(file, { throwIfNoEntry: false });
        if (stat && Date.now() - stat.mtimeMs > STALE_PARTIAL_MS) fs.rmSync(file, { force: true });
    }
    o.log?.(`downloading ${base}/${info.name} (${Math.round(info.bytes / 1e6)} MB)`);
    const archiveUrl = `${base}/${info.name}`;
    // A temporary name of its own: two first runs in different checkouts share the cache.
    const partial = `${archive}.${process.pid}-${randomUUID().slice(0, 8)}.partial`;
    try {
        const body = await get(archiveUrl);
        try {
            await pipeline(body, fs.createWriteStream(partial));
        } catch (error) {
            if (isLocalFileError(error)) throw error;
            throw new ArtifactUnavailableError(`${archiveUrl}: ${formatError(error)}`, { cause: error });
        }
        const failures = await fileFailures(dir, { ...info, name: path.basename(partial) });
        if (failures.length) throw new Error(`${archiveUrl} does not match ${manifestUrl}:\n${failures.join('\n')}`);
        fs.renameSync(partial, archive);
        return archive;
    } finally {
        fs.rmSync(partial, { force: true });
    }
}
