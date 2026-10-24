/**
 * Who presides over each municipal entity (ΔΕΥΑ, ΝΠΔΔ, municipal companies, port fund) today.
 * Diavgeia keeps a signer register per organization, but its "active" flag stays on for past
 * presidents (Rhodes ΔΕΥΑΡ lists five active «Πρόεδρος Δ.Σ.»). The decisions each signer
 * signed in the window are the evidence: the current president signs up to the last weeks.
 *
 *   npx tsx .claude/skills/add-city/scripts/entities.ts <municipality org uid> [--from YYYY-MM-DD] [--extra <uid>,<uid>]
 *
 * Entities: the organizations whose supervisor is the municipality, plus --extra (an entity
 * supervised by someone else, e.g. Rhodes's port fund under the Region: find it in the
 * council's «Ορισμός μελών … Διοικητικού Συμβουλίου» decisions). Default window: 120 days.
 */
import { execFileSync } from 'child_process';

const CLI = ['-y', '-p', '@schemalabs/diavgeia-cli@0.3.0', 'diavgeia'];
const OFFICERS = /Πρόεδρ|Αντιπρόεδρ|Διευθύνων|Εκτελεστικής/;

type Org = { uid: string; label: string; category: string; supervisorId: string | null };
type Signer = { uid: string; firstName: string; lastName: string; activeFrom: number;
                units: Array<{ positionLabel: string }> };
type Decision = { ada: string; issueDate: number; signerIds?: string[] };

function cli<T>(args: string[]): T {
    const out = execFileSync('npx', [...CLI, ...args], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out) as T;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function main(argv: string[]) {
    const flag = (name: string) => {
        const i = argv.indexOf(name);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    const muni = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
    if (!muni) {
        console.error('usage: entities.ts <municipality org uid> [--from YYYY-MM-DD] [--extra <uid>,<uid>]');
        process.exit(2);
    }
    const to = day(Date.now());
    const from = flag('--from') ?? day(Date.now() - 120 * 86_400_000);
    const extra = (flag('--extra') ?? '').split(',').filter(Boolean);

    const orgs = cli<Org[]>(['orgs', 'list', '--status', 'active', '--json']);
    const entities = orgs.filter(o => o.supervisorId === muni || extra.includes(o.uid));
    console.log(`${entities.length} entities of ${orgs.find(o => o.uid === muni)?.label ?? muni}; signatures ${from} → ${to}`);

    for (const org of entities) {
        const signers = cli<Signer[]>(['orgs', 'signers', org.uid]);
        const decisions = cli<Decision[]>(['search', 'query', '--org', org.uid, '--from', from, '--to', to, '--all', '--json']);
        const signed = new Map<string, { count: number; last: number }>();
        for (const d of decisions) {
            for (const id of d.signerIds ?? []) {
                const s = signed.get(id) ?? { count: 0, last: 0 };
                signed.set(id, { count: s.count + 1, last: Math.max(s.last, d.issueDate) });
            }
        }
        console.log(`\n## ${org.uid} ${org.category} ${org.label} · ${decisions.length} decisions`);
        for (const s of signers) {
            const posts = [...new Set(s.units.map(u => u.positionLabel).filter(p => OFFICERS.test(p)))];
            if (!posts.length) continue;
            const act = signed.get(s.uid);
            console.log(`  ${act ? 'SIGNS ' : 'silent'} ${s.lastName} ${s.firstName} · ${posts.join(', ')} · registered ${day(s.activeFrom)}`
                + (act ? ` · ${act.count} signed, last ${day(act.last)}` : ''));
        }
    }
}

if (require.main === module) main(process.argv.slice(2));
