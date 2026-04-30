/**
 * Import municipality populations from a CSV into the City table.
 *
 * Usage:
 *   npx tsx scripts/import_populations.ts data/greek_municipalities.csv
 *
 * CSV format (header row required):
 *   id,name_el,population
 *
 * - `id` matches `City.id` (the slug). When set, takes precedence.
 * - `name_el` matches `City.name` or `City.name_municipality` as a fallback.
 * - `population` is an integer.
 *
 * Rows whose city isn't in the DB are reported but skipped (the CSV is the
 * source of truth for all 332 municipalities; only those onboarded onto the
 * platform are persisted).
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function parseCSVLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ",") {
                fields.push(current);
                current = "";
            } else {
                current += ch;
            }
        }
    }
    fields.push(current);
    return fields;
}

function parseCSV(filePath: string): Record<string, string>[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) throw new Error("CSV is empty");
    const headers = parseCSVLine(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
        const values = parseCSVLine(line);
        const record: Record<string, string> = {};
        headers.forEach((h, i) => {
            record[h] = (values[i] ?? "").trim();
        });
        return record;
    });
}

async function main() {
    const csvPath = process.argv[2];
    if (!csvPath) {
        console.error("Usage: npx tsx scripts/import_populations.ts <path-to-csv>");
        process.exit(1);
    }
    const resolved = path.resolve(csvPath);
    if (!fs.existsSync(resolved)) {
        console.error(`File not found: ${resolved}`);
        process.exit(1);
    }

    const rows = parseCSV(resolved);
    console.log(`Parsed ${rows.length} rows from CSV`);

    const cities = await prisma.city.findMany({
        select: { id: true, name: true, name_municipality: true, population: true },
    });
    const byId = new Map(cities.map((c) => [c.id, c]));
    const byName = new Map<string, typeof cities[0]>();
    for (const c of cities) {
        byName.set(c.name, c);
        byName.set(c.name_municipality, c);
    }

    let updated = 0;
    let unchanged = 0;
    let unmatched = 0;
    const matchedCityIds = new Set<string>();

    for (const row of rows) {
        const id = row.id || "";
        const nameEl = row.name_el || "";
        const populationStr = row.population || "";
        if (!populationStr) continue;

        const population = parseInt(populationStr, 10);
        if (isNaN(population)) {
            console.warn(`Skipping row with invalid population: "${populationStr}" (${id || nameEl})`);
            continue;
        }

        let city = id ? byId.get(id) : undefined;
        if (!city && nameEl) city = byName.get(nameEl);

        if (!city) {
            unmatched++;
            continue;
        }

        matchedCityIds.add(city.id);

        if (city.population === population) {
            unchanged++;
            continue;
        }

        await prisma.city.update({
            where: { id: city.id },
            data: { population },
        });
        updated++;
    }

    const missingFromCsv = cities.filter((c) => !matchedCityIds.has(c.id));

    console.log(`\nDone!`);
    console.log(`  Updated:   ${updated}`);
    console.log(`  Unchanged: ${unchanged}`);
    if (unmatched > 0) {
        console.log(`  Unmatched in CSV (no DB row): ${unmatched}`);
    }
    if (missingFromCsv.length > 0) {
        console.log(`\n  ${missingFromCsv.length} cities in DB have no population data in the CSV:`);
        for (const c of missingFromCsv) {
            console.log(`    - ${c.id} (${c.name})`);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
