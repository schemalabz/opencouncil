/**
 * Print the 2023 municipal election result of one Greek municipality.
 * Source: the public repo schemalabz/greek-municipal-elections (raw GitHub).
 *
 *   npx tsx .claude/skills/add-city/scripts/election.ts <name fragment>     # e.g. "Ξηρομέρου", "Κοζάν" (accents and case ignored)
 *   npx tsx .claude/skills/add-city/scripts/election.ts --id <election id>  # e.g. 9129
 *   add --json to print the raw municipality JSON instead of the summary
 */

const BASE = 'https://raw.githubusercontent.com/schemalabz/greek-municipal-elections/main/data/2023';

type Candidate = { surname: string; firstname: string; votes: number; fathersName?: string };
type Municipality = {
    id: number;
    name: string;
    stats: { seats: number };
    election: { date: string };
    parties: Array<{
        name: string; seatsWon?: number; isWinner?: boolean;
        round1: { percentage: number }; round2?: { percentage: number | null } | null;
        head: Candidate; candidates: Candidate[];
    }>;
};

async function fetchJson<T>(file: string): Promise<T> {
    const res = await fetch(`${BASE}/${file}`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return res.json() as Promise<T>;
}

function fold(s: string): string {
    return s.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase();
}

/** Drop nicknames in brackets («Χρήστος(Στρατηγός)», «Αλεξάνδρα (Αλέκα)») and extra spaces. */
function clean(s: string): string {
    return s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

async function main(argv: string[]) {
    const asJson = argv.includes('--json');
    const args = argv.filter(a => a !== '--json');
    if (!args.length) {
        console.error('usage: election.ts <name fragment> | --id <election id> [--json]');
        process.exit(2);
    }
    let id: number;
    if (args[0] === '--id') {
        id = Number(args[1]);
    } else {
        const needle = fold(args.join(' '));
        const { municipalities } = await fetchJson<{ municipalities: Array<{ id: number; name: string; seats: number }> }>('index.json');
        const hits = municipalities.filter(m => fold(m.name).includes(needle));
        if (hits.length !== 1) {
            for (const m of hits) console.error(m.id, m.name, `seats=${m.seats}`);
            console.error(`${hits.length} municipalities match '${args.join(' ')}'; use --id`);
            process.exit(1);
        }
        id = hits[0].id;
    }
    const d = await fetchJson<Municipality>(`municipalities/${id}.json`);
    if (asJson) {
        console.log(JSON.stringify(d, null, 1));
        return;
    }
    console.log(`election id ${d.id} · Δήμος ${d.name} · ${d.stats.seats} seats · ${d.election.date}`);
    console.log("Seats: the winner's head is the mayor and is NOT a council seat; a minority list's seats INCLUDE its head.");
    console.log('Candidates are in municipality-wide vote order; where the');
    console.log('municipality elects by electoral district (εκλογικές περιφέρειες) the seated candidates are NOT');
    console.log("the top of this order. The data's 'elected' flags are unreliable for the same reason and are not");
    console.log('shown. The first council roll call (January 2024) is the truth for who took the seats.');
    for (const p of d.parties) {
        const r2 = p.round2 ?? null;
        console.log(`\n## ${p.name} · ${p.seatsWon ?? null} seats (${p.isWinner ? 'mayor not included' : 'head included'})`
            + ` · round 1 ${p.round1.percentage}%`
            + (r2 && r2.percentage !== null && r2.percentage !== undefined ? ` · round 2 ${r2.percentage}%` : '')
            + (p.isWinner ? ' · WINNER' : ''));
        console.log(`   HEAD ${clean(p.head.surname)} ${clean(p.head.firstname)} (of ${p.head.fathersName ?? ''})`);
        p.candidates.forEach((c, i) => {
            const nick = [...`${c.firstname} ${c.surname}`.matchAll(/\(([^)]*)\)/g)].map(x => x[1]);
            console.log(`   ${String(i + 1).padStart(3)} ${clean(c.surname)} | ${clean(c.firstname)} | ${c.votes} | of ${c.fathersName ?? ''}`
                + (nick.length ? ` | nickname ${nick.join(', ')}` : ''));
        });
    }
}

if (require.main === module) main(process.argv.slice(2));
