/**
 * Import municipality populations from a CSV into the City table.
 *
 * Usage:
 *   npx tsx scripts/import_populations.ts data/greek_municipalities.csv [--write-ids]
 *
 * CSV format (header row required):
 *   id,name_el,population
 *
 * - `id` matches `City.id` (the slug). When set, takes precedence.
 * - `name_el` matches `City.name` or `City.name_municipality` as a fallback.
 * - `population` is an integer.
 *
 * `--write-ids` backfills the CSV's empty `id` column from the connected
 * database's City ids (matched by name) and rewrites the file in place.
 * Production has every Greek municipality (including non-partnered ones), so
 * run it once against production and commit the enriched CSV — after that,
 * imports match by id alone and name drift can't cause silent skips.
 *
 * Rows whose city isn't in the DB are reported but skipped.
 */

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parseCsvFile } from "./lib/csv";
import { buildSortKey, normalizeGreekName } from "./lib/greek-name-matching";

const prisma = new PrismaClient();

/** Normalized token set of a municipality name, without the "δήμος" prefix. */
function nameTokens(name: string): Set<string> {
    return new Set(
        buildSortKey(normalizeGreekName(name))
            .split(" ")
            .filter(t => t && t !== "δημοσ")
    );
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
    for (const t of a) if (!b.has(t)) return false;
    return a.size > 0;
}

async function main() {
    const csvPath = process.argv[2];
    const writeIds = process.argv.includes("--write-ids");
    if (!csvPath) {
        console.error("Usage: npx tsx scripts/import_populations.ts <path-to-csv> [--write-ids]");
        process.exit(1);
    }
    const resolved = path.resolve(csvPath);
    if (!fs.existsSync(resolved)) {
        console.error(`File not found: ${resolved}`);
        process.exit(1);
    }

    const rows = await parseCsvFile(resolved);
    console.log(`Parsed ${rows.length} rows from CSV`);

    const cities = await prisma.city.findMany({
        select: { id: true, name: true, name_municipality: true, population: true },
    });
    const byId = new Map(cities.map((c) => [c.id, c]));
    const byName = new Map<string, typeof cities[0]>();
    const byNormalizedName = new Map<string, typeof cities[0]>();
    for (const c of cities) {
        byName.set(c.name, c);
        byName.set(c.name_municipality, c);
        byNormalizedName.set(buildSortKey(normalizeGreekName(c.name_municipality)), c);
    }

    /**
     * Match layers: exact name → normalized token-sort (tonos, hyphen and
     * spacing variants) → unique token subset (official long names, e.g.
     * CSV "Δήμος Νάουσας" ⊂ DB "Δήμος Ηρωικής Πόλεως Νάουσας"). Subset
     * matches are only accepted when exactly one candidate qualifies.
     */
    function matchByNameLayered(nameEl: string): typeof cities[0] | undefined {
        const exact = byName.get(nameEl);
        if (exact) return exact;

        const normalized = byNormalizedName.get(buildSortKey(normalizeGreekName(nameEl)));
        if (normalized) return normalized;

        const csvTokens = nameTokens(nameEl);
        const candidates = cities.filter((c) => {
            const dbTokens = nameTokens(c.name_municipality);
            return isSubset(csvTokens, dbTokens) || isSubset(dbTokens, csvTokens);
        });
        return candidates.length === 1 ? candidates[0] : undefined;
    }

    let updated = 0;
    let unchanged = 0;
    let unmatched = 0;
    let idsWritten = 0;
    const matchedCityIds = new Set<string>();
    const unmatchedRows: string[] = [];

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
        if (!city && nameEl) city = matchByNameLayered(nameEl);

        if (!city) {
            unmatched++;
            unmatchedRows.push(nameEl || id);
            continue;
        }

        if (writeIds && !row.id) {
            row.id = city.id;
            idsWritten++;
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

    if (writeIds && idsWritten > 0) {
        // Rewrite the CSV in place, preserving column order and row order.
        const out = ["id,name_el,population"];
        for (const row of rows) {
            const quote = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
            out.push([row.id || "", row.name_el || "", row.population || ""].map(quote).join(","));
        }
        fs.writeFileSync(resolved, out.join("\n") + "\n");
    }

    const missingFromCsv = cities.filter((c) => !matchedCityIds.has(c.id));

    console.log(`\nDone!`);
    console.log(`  Updated:   ${updated}`);
    console.log(`  Unchanged: ${unchanged}`);
    if (writeIds) {
        console.log(`  Ids written back to CSV: ${idsWritten}`);
    }
    if (unmatched > 0) {
        console.log(`  Unmatched in CSV (no DB row): ${unmatched}`);
        for (const name of unmatchedRows) {
            console.log(`    - ${name}`);
        }
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
