#!/usr/bin/env tsx
/**
 * Assembles the regulation JSON for the Papagou-Cholargou parking consultation from the outputs of
 * scripts/parking-consultation (run `python -m ses all` there first).
 *
 *   npm run generate-parking-regulation -- [--public] [--ai-summaries] [--contact-email a@b.c] [--out path]
 *
 * --public copies the result to public/consultations/papagou-ses/regulation.json for local dev.
 * --ai-summaries writes each article's summary with Claude, cached by content hash so only changed
 *   sections cost a call. Without it, a summary is the article's first sentences.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import {
    assembleRegulation,
    checkRegulation,
    summarize,
    type ArticlesConfig,
    type ConsultationConfig,
    type FeatureCollection,
    type GeneratedReport,
    type Patch,
    type SpotProperties,
    type UnitProperties,
    type ZoneProperties,
} from './lib/parking-regulation';
import { validateRegulation } from './lib/regulation-schema';

dotenv.config();

const PIPELINE = path.join(process.cwd(), 'scripts/parking-consultation');
const SUMMARY_MODEL = 'claude-sonnet-5';
const SIZE_WARNING_BYTES = 1_500_000;

function readJson<T>(relative: string): T {
    const raw = JSON.parse(fs.readFileSync(path.join(PIPELINE, relative), 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) delete raw._comment;
    return raw as T;
}

function parseArgs(argv: string[]): { publicCopy: boolean; aiSummaries: boolean; contactEmail?: string; out: string } {
    const args = { publicCopy: false, aiSummaries: false, contactEmail: undefined as string | undefined, out: path.join(PIPELINE, 'out/papagou-ses.json') };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--public') args.publicCopy = true;
        else if (arg === '--ai-summaries') args.aiSummaries = true;
        else if (arg === '--contact-email') args.contactEmail = argv[++i];
        else if (arg === '--out') args.out = argv[++i];
        else throw new Error(`unknown argument ${arg}`);
    }
    return args;
}

async function aiSummaries(report: GeneratedReport): Promise<Record<string, string>> {
    const cachePath = path.join(PIPELINE, 'data/summaries.cache.json');
    const cache: Record<string, string> = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('--ai-summaries needs ANTHROPIC_API_KEY');
    const client = new Anthropic({ apiKey });
    const summaries: Record<string, string> = {};
    let calls = 0;
    for (const chapter of report.chapters) {
        for (const article of chapter.articles) {
            const key = `${chapter.num}.${article.num}`;
            const hash = crypto.createHash('sha256').update(`${SUMMARY_MODEL}\n${article.title}\n${article.bodyMd}`).digest('hex');
            if (!cache[hash]) {
                const response = await client.messages.create({
                    model: SUMMARY_MODEL,
                    max_tokens: 300,
                    system: 'Γράφεις περιλήψεις άρθρων ενός κανονισμού ελεγχόμενης στάθμευσης για δημότες. Απάντησε μόνο με 1–2 προτάσεις στα ελληνικά, σε απλή γλώσσα, χωρίς νέα στοιχεία, χωρίς markdown.',
                    messages: [{ role: 'user', content: `Τίτλος: ${article.title}\n\n${article.bodyMd}` }],
                });
                const text = response.content.find((block) => block.type === 'text');
                if (!text || text.type !== 'text' || !text.text.trim()) throw new Error(`empty summary for ${key}`);
                cache[hash] = text.text.trim();
                calls++;
            }
            summaries[key] = cache[hash];
        }
    }
    fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
    console.log(`summaries: ${calls} new call(s) to ${SUMMARY_MODEL}, ${Object.keys(summaries).length - calls} from the cache`);
    return summaries;
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const config = readJson<ConsultationConfig & { publicDir: string }>('config/consultation.json');
    if (args.contactEmail) config.contactEmail = args.contactEmail;
    const articles = readJson<ArticlesConfig>('config/articles.json');
    const patches = readJson<{ patches: Patch[] }>('config/patches.json').patches;
    const report = readJson<GeneratedReport>('data/report.generated.json');
    const units = readJson<FeatureCollection<UnitProperties>>('data/units.geojson');
    const spots = readJson<FeatureCollection<SpotProperties>>('data/spots.geojson');
    const zones = readJson<FeatureCollection<ZoneProperties>>('data/zones.geojson');

    for (const anomaly of report.anomalies) console.warn(`report anomaly: ${anomaly}`);
    const summaries = args.aiSummaries ? await aiSummaries(report) : {};
    const { data, warnings } = assembleRegulation({ report, units, spots, zones, config, articles, patches, summaries });
    for (const warning of warnings) console.warn(`warning: ${warning}`);
    if (config.contactEmail.includes('REPLACE') || config.sources.some((s) => s.url.includes('REPLACE'))) {
        console.warn('warning: contactEmail or a source URL is still a placeholder (REPLACE); fix config/consultation.json before uploading');
    }

    const problems = checkRegulation(data);
    if (problems.length) {
        problems.forEach((p) => console.error(`check: ${p}`));
        process.exit(1);
    }
    const validation = validateRegulation(data);
    if (!validation.valid) {
        validation.errors.forEach((e) => console.error(`schema: ${e}`));
        process.exit(1);
    }

    const json = JSON.stringify(data);
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, json);
    const counts = data.regulation.map((item) => `${item.id}: ${item.type === 'chapter' ? `${item.articles?.length ?? 0} articles` : `${item.geometries?.length ?? 0} geometries`}`);
    console.log(`wrote ${args.out} (${(json.length / 1024).toFixed(0)} KB)\n  ${counts.join('\n  ')}`);
    if (json.length > SIZE_WARNING_BYTES) console.warn(`warning: the file is over ${SIZE_WARNING_BYTES / 1e6} MB; it travels in every page load`);
    if (!args.aiSummaries) console.log(`summaries: first sentences (${summarize.name}); pass --ai-summaries for written ones`);

    if (args.publicCopy) {
        const publicPath = path.join(process.cwd(), 'public', config.publicDir, 'regulation.json');
        fs.mkdirSync(path.dirname(publicPath), { recursive: true });
        fs.writeFileSync(publicPath, json);
        console.log(`copied to ${publicPath} (served at /${config.publicDir}/regulation.json in local dev)`);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
