import fs from 'fs';

const MODEL_LINE = /^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/;

/** Names of every `model` block in a Prisma schema, in file order. */
export function listPrismaModels(schemaText: string): string[] {
    const names: string[] = [];
    for (const line of schemaText.split('\n')) {
        const match = MODEL_LINE.exec(line);
        if (match) names.push(match[1]);
    }
    return names;
}

export function listPrismaModelsFromFile(schemaPath: string): string[] {
    return listPrismaModels(fs.readFileSync(schemaPath, 'utf8'));
}
