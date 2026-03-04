/**
 * i18n Sync Script
 *
 * PURPOSE: Adds [TODO] placeholders for keys that exist in one locale but not the other.
 *
 * WHEN TO RUN (locally only, never in CI):
 *   1. After adding a new key to el.json (source of truth) → run to add [TODO: EN] in en.json
 *   2. After adding a new key to en.json → run to add [TODO: EL] in el.json
 *   3. After the sync, fill in the actual translations and commit.
 *
 * NOTE: Syncs both monolithic and modular (messages/el/, messages/en/) files.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, '../messages');
const elPath = path.join(messagesDir, 'el.json');
const enPath = path.join(messagesDir, 'en.json');

function syncKeys(source: Record<string, unknown>, target: Record<string, unknown>, todoPrefix: string): boolean {
    let changed = false;
    for (const key in source) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            if (target[key] === undefined || target[key] === null) {
                target[key] = {};
                changed = true;
            }
            if (syncKeys(source[key] as Record<string, unknown>, target[key] as Record<string, unknown>, todoPrefix)) {
                changed = true;
            }
        } else {
            if (target[key] === undefined) {
                target[key] = `${todoPrefix} ${source[key]}`;
                changed = true;
            }
        }
    }
    return changed;
}

function syncFile(sourcePath: string, targetPath: string, todoPrefix: string): void {
    if (!fs.existsSync(sourcePath)) return;

    let sourceData: Record<string, unknown>;
    try {
        sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    } catch (err) {
        console.error(`Failed to parse ${path.relative(process.cwd(), sourcePath)}: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }

    let targetData: Record<string, unknown>;
    try {
        targetData = fs.existsSync(targetPath) ? JSON.parse(fs.readFileSync(targetPath, 'utf8')) : {};
    } catch (err) {
        console.error(`Failed to parse ${path.relative(process.cwd(), targetPath)}: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }

    if (syncKeys(sourceData, targetData, todoPrefix)) {
        fs.writeFileSync(targetPath, JSON.stringify(targetData, null, 4) + '\n');
        console.log(`Updated ${path.relative(process.cwd(), targetPath)}`);
    }
}

function syncDirectory(sourceDir: string, targetDir: string, todoPrefix: string): void {
    if (!fs.existsSync(sourceDir)) return;
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    fs.readdirSync(sourceDir).forEach(file => {
        if (file.endsWith('.json')) {
            syncFile(path.join(sourceDir, file), path.join(targetDir, file), todoPrefix);
        }
    });
}

// 1. Sync Monolithic Files
syncFile(elPath, enPath, '[TODO: EN]');
syncFile(enPath, elPath, '[TODO: EL]');

// 2. Sync Modular Directories
const elDir = elPath.replace('.json', '');
const enDir = enPath.replace('.json', '');

syncDirectory(elDir, enDir, '[TODO: EN]');
syncDirectory(enDir, elDir, '[TODO: EL]');
