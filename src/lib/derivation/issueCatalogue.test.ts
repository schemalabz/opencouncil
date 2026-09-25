import fs from 'fs';
import path from 'path';
import { ISSUE_CODES, type IssueCode } from './types';
import {
    DERIVATION_STAGES, ISSUE_STAGES, codesForStage,
    type DerivationStage,
} from './issueCatalogue';

/**
 * `ISSUE_STAGES` states where each code comes from, and the app prints that
 * statement as fact — in the audit line, the rail's issues card and the
 * derivation dialog. Nothing but these tests keeps it true: they read the
 * derivation's own source and fail when the steps it says a code is raised at
 * are not the steps that raise it.
 *
 * Severity needs no such test any more. An `Issue` carries none, so
 * `ISSUE_SEVERITY` is the only statement of it and has nothing to disagree with.
 */
const DIR = path.join(__dirname);

/** Which step each file's raise sites belong to. A file missing here is caught below. */
const STAGE_OF_FILE: Record<string, DerivationStage> = {
    'deriveMeetingFacts.ts': 'read',
    'placeEvents.ts': 'place',
    'replayAttendance.ts': 'presence',
    'deriveVotes.ts': 'votes',
    'persist.ts': 'write',
};

const RAISE = /code:\s*'([A-Z_]+)'/g;

interface RaiseSite { code: string; file: string }

function raiseSites(): RaiseSite[] {
    const files = fs.readdirSync(DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const found: RaiseSite[] = [];
    for (const file of files) {
        const src = fs.readFileSync(path.join(DIR, file), 'utf-8');
        for (const m of src.matchAll(RAISE)) found.push({ code: m[1], file });
    }
    return found;
}

describe('issue catalogue', () => {
    const sites = raiseSites();

    it('finds a raise site for every declared code', () => {
        // Guards the regex itself: a refactor that reshapes how issues are
        // constructed would otherwise silently reduce this suite to nothing.
        const raised = new Set(sites.map(s => s.code));
        expect([...raised].sort()).toEqual([...ISSUE_CODES].sort());
    });

    it('raises issues only from files this catalogue knows the step of', () => {
        const unknown = [...new Set(sites.filter(s => !STAGE_OF_FILE[s.file]).map(s => s.file))];
        expect(unknown).toEqual([]);
    });

    it('agrees with every raise site about which steps raise a code', () => {
        const actual: Record<string, DerivationStage[]> = {};
        for (const s of sites) {
            const stage = STAGE_OF_FILE[s.file];
            const seen = (actual[s.code] ??= []);
            if (!seen.includes(stage)) seen.push(stage);
        }
        const order = (a: DerivationStage[]) =>
            [...a].sort((x, y) => DERIVATION_STAGES.indexOf(x) - DERIVATION_STAGES.indexOf(y));

        for (const code of ISSUE_CODES) {
            expect({ code, stages: order(actual[code] ?? []) })
                .toEqual({ code, stages: order([...ISSUE_STAGES[code]]) });
        }
    });

    it('places every code under exactly the steps that claim it', () => {
        const fromStages = new Map<IssueCode, DerivationStage[]>();
        for (const stage of DERIVATION_STAGES) {
            for (const code of codesForStage(stage)) {
                fromStages.set(code, [...(fromStages.get(code) ?? []), stage]);
            }
        }
        expect(fromStages.size).toBe(ISSUE_CODES.length);
        for (const code of ISSUE_CODES) {
            expect(fromStages.get(code)).toEqual([...ISSUE_STAGES[code]]);
        }
    });
});
