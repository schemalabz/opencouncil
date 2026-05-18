/**
 * Updates elected order for a municipality's council members based on official
 * election results from the greek-municipal-elections open data repo.
 *
 * Elected order is determined by:
 *   - Party ordering: parties with more seats come first (winning party first)
 *   - Within each party: the party head (mayoral candidate) is first, then
 *     council members ordered by votes (σταυροί) descending
 *   - Replacement members (who entered the council after the election) are
 *     placed right after the last elected member of their party, based on
 *     their vote ranking
 *
 * Usage:
 *   npx tsx scripts/update_elected_order.ts --city chalandri [--dry-run]
 *   npx tsx scripts/update_elected_order.ts --city chalandri --dhm-id 9178 [--dry-run]
 *   npx tsx scripts/update_elected_order.ts --search χαλάνδρι
 *
 * The script reads people from the database, loads election data from the
 * greek-municipal-elections repo (local clone or GitHub), matches names, and
 * writes electedOrder directly to Role records.
 *
 * Data source: https://github.com/schemalabz/greek-municipal-elections
 *
 * Name matching uses token-sort keys with Greek name normalization (same
 * approach as decisionPdfExtraction.ts in opencouncil-tasks). Handles reversed
 * name order, nicknames in parentheses, diacritics, and final sigma differences.
 * Members that can't be matched to election candidates (replacements not in the
 * original election) are placed at the end.
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { normalizeGreekName, tokenSortKeys, matchByName, MatchCandidate, DbMember as MatchDbMember } from './lib/greek-name-matching';

dotenv.config();

const prisma = new PrismaClient();

// Resolve the election data directory: local sibling clone or GitHub raw URL
const LOCAL_DATA_DIR = path.resolve(__dirname, '../../greek-municipal-elections/data/2023');
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/schemalabz/greek-municipal-elections/main/data/2023';

// --- Types (matching the open data schema) ---

interface ElectionCandidate {
    surname: string;
    firstname: string;
    fathersName: string;
    votes: number;
    elected: boolean;
}

interface ElectionPartyHead {
    surname: string;
    firstname: string;
    fathersName: string;
}

interface ElectionParty {
    id: number;
    name: string;
    head: ElectionPartyHead;
    round1: { votes: number; percentage: number };
    round2: { votes: number; percentage: number } | null;
    seatsWon: number;
    isWinner: boolean;
    candidates: ElectionCandidate[];
}

interface MunicipalityData {
    id: number;
    name: string;
    parties: ElectionParty[];
}

interface IndexEntry {
    id: number;
    name: string;
    seats: number;
}

interface IndexData {
    municipalities: IndexEntry[];
}

interface ElectedMember {
    surname: string;
    firstname: string;
    partyName: string;
    candId: number;
    votes: number;
    isPartyHead: boolean;
    globalOrder: number;
    partyInternalRank: number;
}

interface DbMember {
    roleId: string;
    personId: string;
    name: string;
}

// --- Data loading ---

async function loadJson<T>(relativePath: string): Promise<T> {
    const localPath = path.join(LOCAL_DATA_DIR, relativePath);
    if (fs.existsSync(localPath)) {
        return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    }
    // Fallback: fetch from GitHub
    const url = `${GITHUB_RAW_BASE}/${relativePath}`;
    console.log(`  (fetching from GitHub: ${relativePath})`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json() as Promise<T>;
}

// --- Core logic ---

async function loadElectionData(dhmId: string): Promise<ElectedMember[]> {
    const data = await loadJson<MunicipalityData>(`municipalities/${dhmId}.json`);
    console.log(`Municipality: ${data.name}`);
    console.log(`Parties: ${data.parties.length}`);

    // Build elected member list from the open data JSON.
    // Parties are already sorted (seats desc, then votes) in the data.
    const elected: ElectedMember[] = [];
    let globalOrder = 1;

    for (const party of data.parties) {
        // Party head gets first position
        elected.push({
            surname: party.head.surname,
            firstname: party.head.firstname,
            partyName: party.name,
            candId: party.id,
            votes: party.round1.votes,
            isPartyHead: true,
            globalOrder: globalOrder++,
            partyInternalRank: 1,
        });

        // All candidates — elected ones get globalOrder, rest get 0 (resolved during matching)
        for (let i = 0; i < party.candidates.length; i++) {
            const c = party.candidates[i];
            elected.push({
                surname: c.surname,
                firstname: c.firstname,
                partyName: party.name,
                candId: party.id,
                votes: c.votes,
                isPartyHead: false,
                globalOrder: c.elected ? globalOrder++ : 0,
                partyInternalRank: i + 2,
            });
        }
    }

    return elected;
}

// --- Greek name matching (same approach as decisionPdfExtraction.ts in opencouncil-tasks) ---

function matchMembers(
    elected: ElectedMember[],
    dbMembers: DbMember[]
): { matched: Map<string, number>; unmatched: string[] } {
    // Build candidates from election data
    const candidates: MatchCandidate[] = elected.map((e, i) => ({
        name: `${e.surname} ${e.firstname}`,
        index: i,
    }));

    const matchDbMembers: MatchDbMember[] = dbMembers.map(m => ({
        id: m.personId,
        name: m.name,
    }));

    const { matched: personMatches, unmatched } = matchByName(candidates, matchDbMembers);

    // Convert person matches to globalOrder values
    const matched = new Map<string, number>();
    for (const [personId, electedIdx] of personMatches) {
        const e = elected[electedIdx];
        if (e.globalOrder > 0) {
            matched.set(personId, e.globalOrder);
        } else {
            // Replacement: candidate beyond seat cutoff
            const lastElectedInParty = elected
                .filter(el => el.candId === e.candId && el.globalOrder > 0)
                .reduce((max, el) => Math.max(max, el.globalOrder), 0);
            const seatsInParty = elected.filter(el => el.candId === e.candId && el.globalOrder > 0).length;
            const offset = e.partyInternalRank - seatsInParty;
            matched.set(personId, lastElectedInParty + offset);
        }
    }

    return { matched, unmatched };
}

// --- Municipality lookup ---

async function searchMunicipalities(query: string): Promise<IndexEntry[]> {
    const stripped = query.replace(/^δήμος\s+|^δημος\s+/i, '');
    const normalizedQuery = normalizeGreekName(stripped);

    const index = await loadJson<IndexData>('index.json');
    return index.municipalities.filter(m =>
        normalizeGreekName(m.name).includes(normalizedQuery)
    );
}

async function findDhmId(cityName: string): Promise<string | null> {
    console.log(`Searching for "${cityName}" in election data...\n`);
    const matches = await searchMunicipalities(cityName);

    if (matches.length === 0) {
        console.log('No matches found.');
        return null;
    } else if (matches.length === 1) {
        console.log(`Found: ${matches[0].id} — ${matches[0].name} (${matches[0].seats} seats)\n`);
        return String(matches[0].id);
    } else {
        console.log(`Multiple matches found:\n`);
        for (const m of matches) {
            console.log(`  ${m.id} — ${m.name} (${m.seats} seats)`);
        }
        console.log(`\nPlease specify --dhm-id explicitly.`);
        return null;
    }
}

// --- Main ---

async function main() {
    const argv = await yargs(hideBin(process.argv))
        .option('city', { type: 'string', describe: 'City ID from our database' })
        .option('dhm-id', { type: 'string', describe: 'Municipality DHM_ID (optional, auto-detected from city name)' })
        .option('dry-run', { type: 'boolean', default: false, describe: 'Preview changes without writing to database' })
        .option('search', { type: 'string', describe: 'Search for a municipality by name' })
        .check(argv => {
            if (argv.search) return true;
            if (argv.city) return true;
            throw new Error('Either --city or --search is required');
        })
        .help()
        .argv;

    // Check data source
    if (fs.existsSync(LOCAL_DATA_DIR)) {
        console.log(`Data source: ${LOCAL_DATA_DIR}\n`);
    } else {
        console.log(`Data source: ${GITHUB_RAW_BASE} (no local clone found)\n`);
    }

    if (argv.search) {
        const matches = await searchMunicipalities(argv.search);
        if (matches.length === 0) {
            console.log('No matches found.');
        } else {
            console.log(`Found ${matches.length} match${matches.length > 1 ? 'es' : ''}:\n`);
            for (const m of matches) {
                console.log(`  ${m.id} — ${m.name} (${m.seats} seats)`);
            }
        }
        return;
    }

    const cityId = argv.city!;

    // Load city from database
    const city = await prisma.city.findUnique({
        where: { id: cityId },
        select: { id: true, name: true, name_municipality: true },
    });
    if (!city) {
        console.error(`City not found: ${cityId}`);
        process.exit(1);
    }
    console.log(`City: ${city.name_municipality} (${city.id})\n`);

    // Resolve DHM_ID
    let dhmId: string | undefined = argv.dhmId;
    if (!dhmId) {
        dhmId = await findDhmId(city.name_municipality) ?? undefined;
        if (!dhmId) {
            process.exit(1);
        }
    }

    // Find the council administrative body for this city
    const councilBody = await prisma.administrativeBody.findFirst({
        where: { cityId, type: 'council' },
        select: { id: true, name: true },
    });

    if (!councilBody) {
        console.error(`No council administrative body found for city ${cityId}`);
        process.exit(1);
    }
    console.log(`Administrative body: ${councilBody.name} (${councilBody.id})\n`);

    // Load people from database (council members with active roles)
    const people = await prisma.person.findMany({
        where: { cityId },
        select: {
            id: true,
            name: true,
            roles: {
                where: { endDate: null },
                select: { id: true, electedOrder: true, cityId: true, partyId: true, administrativeBodyId: true },
            },
        },
    });

    // Find each person's council body role
    const dbMembers: DbMember[] = people.flatMap(person => {
        const role = person.roles.find(r => r.administrativeBodyId === councilBody.id);
        if (!role) return [];
        return [{ roleId: role.id, personId: person.id, name: person.name }];
    });

    // Warn about people with no council role
    const peopleWithoutCouncilRole = people.filter(
        p => p.roles.length > 0 && !p.roles.some(r => r.administrativeBodyId === councilBody.id)
    );
    if (peopleWithoutCouncilRole.length > 0) {
        console.log(`Warning: ${peopleWithoutCouncilRole.length} people have roles but no council body role:`);
        for (const p of peopleWithoutCouncilRole) {
            console.log(`  - ${p.name}`);
        }
        console.log();
    }

    console.log(`Loaded ${dbMembers.length} council members from database\n`);

    // Load election data
    const elected = await loadElectionData(dhmId);
    console.log(`\nElected members from election data: ${elected.length}\n`);

    // Print election results
    let currentParty = -1;
    for (const e of elected) {
        if (e.candId !== currentParty) {
            currentParty = e.candId;
            console.log(`--- ${e.partyName} ---`);
        }
        const label = e.isPartyHead ? '(head)' : `${e.votes} votes`;
        console.log(`  ${e.globalOrder.toString().padStart(2)}. ${e.surname} ${e.firstname} — ${label}`);
    }

    // Match
    console.log(`\nMatching names...`);
    const { matched, unmatched } = matchMembers(elected, dbMembers);
    console.log(`Matched: ${matched.size}/${dbMembers.length}`);

    if (unmatched.length > 0) {
        console.log(`\nUnmatched members (may be replacements not in election data):`);
        for (const name of unmatched) {
            console.log(`  - ${name}`);
        }
        const maxOrder = Math.max(...[...matched.values()], 0);
        let nextOrder = maxOrder + 1;
        for (const m of dbMembers) {
            if (!matched.has(m.personId)) {
                matched.set(m.personId, nextOrder++);
                console.log(`  → ${m.name} assigned order ${nextOrder - 1}`);
            }
        }
    }

    // Renumber sequentially to eliminate gaps and collisions
    const sortedByRawOrder = [...dbMembers]
        .map(m => ({ personId: m.personId, roleId: m.roleId, rawOrder: matched.get(m.personId) ?? Infinity }))
        .sort((a, b) => a.rawOrder - b.rawOrder);
    const finalOrder = new Map<string, { roleId: string; order: number }>();
    sortedByRawOrder.forEach((entry, i) => finalOrder.set(entry.personId, { roleId: entry.roleId, order: i + 1 }));

    // Show results
    console.log(`\nFinal elected order:`);
    const sorted = [...finalOrder.entries()].sort((a, b) => a[1].order - b[1].order);
    for (const [personId, { order }] of sorted) {
        const member = dbMembers.find(m => m.personId === personId)!;
        console.log(`  ${order.toString().padStart(2)}. ${member.name}`);
    }

    // Write to database
    if (!argv.dryRun) {
        const rankings = [...finalOrder.values()].map(({ roleId, order }) => ({
            roleId,
            electedOrder: order,
        }));

        await prisma.$transaction(
            rankings.map(({ roleId, electedOrder }) =>
                prisma.role.update({
                    where: { id: roleId },
                    data: { electedOrder },
                })
            )
        );

        console.log(`\nWritten ${rankings.length} elected orders to database.`);
    } else {
        console.log(`\nDry run — no database changes.`);
    }
}

main()
    .catch(err => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
