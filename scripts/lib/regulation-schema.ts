import fs from 'fs';
import path from 'path';
import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

export interface RegulationValidation {
    valid: boolean;
    errors: string[];
}

let cachedValidator: ReturnType<Ajv['compile']> | null = null;

function validator(): ReturnType<Ajv['compile']> {
    if (cachedValidator) return cachedValidator;
    const schemaPath = path.join(process.cwd(), 'json-schemas/regulation.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    cachedValidator = ajv.compile(schema);
    return cachedValidator;
}

function describe(error: ErrorObject): string {
    const where = error.instancePath || 'root';
    const params = error.params ? ` ${JSON.stringify(error.params)}` : '';
    return `${where}: ${error.message ?? 'invalid'}${params}`;
}

/** Validates a regulation object against json-schemas/regulation.schema.json. */
export function validateRegulation(data: unknown): RegulationValidation {
    const validate = validator();
    const valid = validate(data) as boolean;
    return { valid, errors: valid ? [] : (validate.errors ?? []).map(describe) };
}
