/**
 * Generate OpenAPI spec from registered Zod schemas.
 *
 * Usage:
 *   npm run generate-openapi            # writes to swagger.yaml (default)
 *   npm run generate-openapi -- --json  # writes to openapi.json
 *
 * The generated spec is served by:
 *   - GET /api          (JSON, for programmatic consumers)
 *   - /docs page        (rendered via swagger-ui-react)
 */
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Side-effect: registers all routes on the shared registry
import { generateSpec } from '../src/lib/openapi';

const spec = generateSpec();

const useJson = process.argv.includes('--json');
const outFile = useJson ? 'openapi.json' : 'swagger.yaml';
const outPath = path.resolve(process.cwd(), outFile);

if (useJson) {
    fs.writeFileSync(outPath, JSON.stringify(spec, null, 2) + '\n');
} else {
    fs.writeFileSync(outPath, yaml.dump(spec, { lineWidth: 120, noRefs: true }));
}

console.log(`OpenAPI spec written to ${outFile}`);
