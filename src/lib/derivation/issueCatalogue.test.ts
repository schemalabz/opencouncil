import fs from 'fs';
import path from 'path';
import { ISSUE_CODES, type IssueCode } from './types';
import {
    DERIVATION_STAGES, ISSUE_SEVERITY, ISSUE_STAGES, codesForStage,
    type DerivationStage, type IssueSeverity,
} from './issueCatalogue';

/**
 * The catalogue mirrors literals that live at the raise sites, so on its own it
 * is a second copy free to drift — and a glossary that drifts teaches the
 * wrong thing with a straight face. These tests read the derivation's own
 * source and fail when the two disagree, which is what lets the app state a
 * code's severity and origin as fact.
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

const RAISE = /code:\s*'([A-Z_]+)'\s*,\s*severity:\s*'(info|warning|error)'/g;

interface RaiseSite { code: string; severity: string; file: string }

function raiseSites(): RaiseSite[] {
    const files = fs.readdirSync(DIR).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const found: RaiseSite[] = [];
    for (const file of files) {
        const src = fs.readFileSync(path.join(DIR, file), 'utf-8');
        for (const m of src.matchAll(RAISE)) found.push({ code: m[1], severity: m[2], file });
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

    it('agrees with every raise site about severity', () => {
        const actual: Record<string, Set<string>> = {};
        for (const s of sites) (actual[s.code] ??= new Set()).add(s.severity);

        // One code raised at two severities would make a single stated severity
        // a lie; the catalogue's shape forbids it, so assert it here too.
        const ambiguous = Object.entries(actual).filter(([, v]) => v.size > 1).map(([c]) => c);
        expect(ambiguous).toEqual([]);

        const flat = Object.fromEntries(Object.entries(actual).map(([c, v]) => [c, [...v][0]]));
        expect(flat).toEqual(ISSUE_SEVERITY as Record<string, IssueSeverity>);
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
