import fs from 'fs';
import path from 'path';
import en from '../../../messages/en.json';
import el from '../../../messages/el.json';

function getAllKeys(obj: object, prefix = ''): string[] {
    return Object.entries(obj).flatMap(([k, v]) => {
        const full = prefix ? `${prefix}.${k}` : k;
        return typeof v === 'object' && v !== null
            ? [full, ...getAllKeys(v as object, full)]
            : [full];
    });
}

const messagesDir = path.join(__dirname, '..', '..', '..', 'messages');

function getModularFiles(): string[] {
    const enDir = path.join(messagesDir, 'en');
    const elDir = path.join(messagesDir, 'el');
    const enFiles = fs.existsSync(enDir) ? fs.readdirSync(enDir).filter(f => f.endsWith('.json')) : [];
    const elFiles = fs.existsSync(elDir) ? fs.readdirSync(elDir).filter(f => f.endsWith('.json')) : [];
    return [...new Set([...enFiles, ...elFiles])].sort();
}

function loadJson(filePath: string): object {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('translations sync', () => {
    it('en.json and el.json should have matching keys (bidirectional, deep)', () => {
        const enKeys = new Set(getAllKeys(en));
        const elKeys = new Set(getAllKeys(el));

        const missingInEn = [...elKeys].filter(k => !enKeys.has(k));
        const missingInEl = [...enKeys].filter(k => !elKeys.has(k));

        expect(missingInEn).toEqual([]);
        expect(missingInEl).toEqual([]);
    });

    const modularFiles = getModularFiles();

    it.each(modularFiles)('modular file %s should have matching keys (bidirectional, deep)', (file) => {
        const enPath = path.join(messagesDir, 'en', file);
        const elPath = path.join(messagesDir, 'el', file);

        const enObj = fs.existsSync(enPath) ? loadJson(enPath) : {};
        const elObj = fs.existsSync(elPath) ? loadJson(elPath) : {};

        const enKeys = new Set(getAllKeys(enObj));
        const elKeys = new Set(getAllKeys(elObj));

        const missingInEn = [...elKeys].filter(k => !enKeys.has(k));
        const missingInEl = [...enKeys].filter(k => !elKeys.has(k));

        expect(missingInEn).toEqual([]);
        expect(missingInEl).toEqual([]);
    });
});
