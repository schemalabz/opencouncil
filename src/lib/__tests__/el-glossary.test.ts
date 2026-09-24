/**
 * Greek terminology guard. In Greek copy the notifications feature — the email
 * summary and Νότης on WhatsApp/SMS — is «ενημερώσεις», never «ειδοποιήσεις».
 * This keeps the old word from drifting back into the Greek catalogs or into
 * the Greek text written in the code.
 */
import fs from 'fs';
import path from 'path';
import { loadLocaleStrings } from './catalogStrings';

// The stem rather than the word: «ειδοποίηση» carries its accent on the letter
// after it. «προειδοποίηση» is a warning, a different word.
const BANNED = /(?<!προ)ειδοπο/iu;

const ALLOWED_KEYS = new Set([
    // The preview of Νότης's first WhatsApp message. It mirrors the
    // Meta-approved template `notis_intro` (services/notis/src/agent/templates.ts)
    // word for word, so it changes only when the template does.
    'el/notificationSignup.json.firstMessageBody',
]);

const srcDir = path.join(__dirname, '../..');

const ALLOWED_FILES = new Set([
    // Legal text. It changes only when the data protection officer revises it.
    'app/[locale]/(other)/privacy/page.tsx',
    'app/[locale]/(other)/terms/page.tsx',
]);

/** Source files under src/, relative to it, without tests: a fixture may quote the old word. */
function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '__tests__') sourceFiles(full, out);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
            out.push(path.relative(srcDir, full));
        }
    }
    return out;
}

const allMessages = loadLocaleStrings('el');

describe('Greek glossary', () => {
    it('calls the notifications feature ενημερώσεις in the catalogs', () => {
        const violations = allMessages
            .filter(([key, msg]) => !ALLOWED_KEYS.has(key) && BANNED.test(msg))
            .map(([key, msg]) => `${key}: "${msg}"`);
        expect(violations).toEqual([]);
    });

    it('calls it ενημερώσεις in the Greek text of the code', () => {
        const violations = sourceFiles(srcDir)
            .filter((file) => !ALLOWED_FILES.has(file))
            .flatMap((file) =>
                fs
                    .readFileSync(path.join(srcDir, file), 'utf8')
                    .split('\n')
                    .flatMap((line, i) => (BANNED.test(line) ? [`src/${file}:${i + 1}: ${line.trim()}`] : [])),
            );
        expect(violations).toEqual([]);
    });

    it('allows only keys and files that still need the exception', () => {
        for (const key of ALLOWED_KEYS) {
            expect(allMessages.find(([k]) => k === key)?.[1]).toMatch(BANNED);
        }
        for (const file of ALLOWED_FILES) {
            expect(fs.readFileSync(path.join(srcDir, file), 'utf8')).toMatch(BANNED);
        }
    });
});
