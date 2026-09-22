import fs from 'fs';
import type { MinutesData } from '@/lib/minutes/types';

export const GOLDEN_PATH = 'fixtures/minutes-golden.json';

export type Claim = { outcome?: 'unanimous' | 'majority'; for?: string[]; against?: string[]; blank?: string[]; declaredPresent?: string[]; declaredAbstain?: string[]; present?: string[]; absent?: string[]; decisionNumber?: string };
export type GoldenMeeting = {
    cityId: string; meetingId: string; source: string;
    rollCall?: { president?: string; mayorPresent?: boolean; present: string[]; absent: string[]; remote?: string[] };
    changes?: Array<{ name: string; kind: 'arrival' | 'departure'; anchor: { kind: string; agendaItemIndex?: number; timing?: string; decisionNumber?: string } }>;
    withdrawn?: number[];
    subjects: Record<string, Claim>;
};
export type Fixture = { meetings: GoldenMeeting[] };

export const loadGolden = (path = GOLDEN_PATH) => JSON.parse(fs.readFileSync(path, 'utf-8')) as Fixture;

/**
 * The key a fixture names a subject by: its agenda item number, or `OA<n>` for
 * the n-th out-of-agenda subject in the order the minutes print them.
 */
export function subjectsByClaimKey(data: MinutesData) {
    let oa = 0;
    const byKey = new Map<string, MinutesData['subjects'][number]>();
    const keyBySubjectId = new Map<string, string>();
    for (const s of data.subjects) {
        const k = s.nonAgendaReason === 'outOfAgenda' ? `OA${++oa}` : String(s.agendaItemIndex);
        byKey.set(k, s); keyBySubjectId.set(s.subjectId, k);
    }
    return { byKey, keyBySubjectId };
}
