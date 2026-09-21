import type { DataSource } from '@prisma/client';
import type { EventRow, Issue, IssueParams, OrderedSubject } from './types';

/**
 * What placing an event reads off it. Narrower than `EventRow` so the minutes
 * can place the rows they hold (which carry no `source` of their own) through
 * this one implementation instead of a second copy of the rules.
 */
export type PlaceableEvent = Pick<EventRow,
    'personId' | 'kind' | 'anchorKind' | 'anchorAgendaItemIndex' | 'anchorNonAgendaReason'
    | 'anchorDecisionNumber' | 'anchorSubjectId' | 'anchorPhase' | 'timing' | 'rawText'
> & { source?: DataSource };

export interface PlacedEvent<E extends PlaceableEvent = EventRow> { event: E; effectAt: number }

/**
 * The first digit run of a decision number, which for «286/2026» is the 286 the
 * clerk counts by. A prefixed form like «ΑΚΣ 12/286/2026» therefore reads 12 —
 * accepted, because the prefix is stable within one body and the ordinals only
 * ever get compared to each other.
 */
export function decisionOrdinal(n: string | null | undefined): number | null {
    const m = n?.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
}

/** 1-based position among the out-of-agenda subjects, which is what an OA anchor counts. */
function outOfAgendaOrdinals(subjects: OrderedSubject[]): Map<string, number> {
    const ordinals = new Map<string, number>();
    let n = 0;
    for (const s of subjects) if (s.nonAgendaReason === 'outOfAgenda') ordinals.set(s.id, ++n);
    return ordinals;
}

function afterOrAt(index: number, timing: PlaceableEvent['timing']): number {
    return timing === 'AFTER' ? index + 1 : index;
}

/**
 * Where each stored event takes effect in the transcript order: the index of the
 * first subject whose attendance it changes. `subjects.length` means "after the
 * last subject" (no effect). Unplaceable events become issues, not rows.
 */
export function placeEvents<E extends PlaceableEvent>(subjects: OrderedSubject[], events: E[]): { placed: PlacedEvent<E>[]; issues: Issue[] } {
    const placed: PlacedEvent<E>[] = [];
    const issues: Issue[] = [];
    const unplaceable = (e: E, reason: IssueParams['UNPLACEABLE_ANCHOR']['reason'], detail = '') => issues.push({
        code: 'UNPLACEABLE_ANCHOR', severity: 'warning', personId: e.personId, source: e.source ?? null, rawText: e.rawText,
        params: { kind: e.kind, reason, detail },
    });

    const oaOrdinal = outOfAgendaOrdinals(subjects);

    for (const e of events) {
        let index = -1;
        switch (e.anchorKind) {
            case 'AGENDA_ITEM': {
                const oa = e.anchorNonAgendaReason === 'outOfAgenda';
                // Subject.agendaItemIndex is null for non-agenda subjects, so an
                // out-of-agenda anchor is matched against the OA ordinal instead.
                if (e.anchorAgendaItemIndex == null) { unplaceable(e, 'noAgendaItem'); continue; }
                index = oa
                    ? subjects.findIndex(s => s.nonAgendaReason === 'outOfAgenda' && oaOrdinal.get(s.id) === e.anchorAgendaItemIndex)
                    : subjects.findIndex(s => s.nonAgendaReason !== 'outOfAgenda' && s.agendaItemIndex === e.anchorAgendaItemIndex);
                if (index < 0) { unplaceable(e, 'noSuchAgendaItem', `${oa ? 'OA' : '#'}${e.anchorAgendaItemIndex}`); continue; }
                index = afterOrAt(index, e.timing);
                break;
            }
            case 'SUBJECT': {
                index = subjects.findIndex(s => s.id === e.anchorSubjectId);
                if (index < 0) { unplaceable(e, 'noSuchSubject', e.anchorSubjectId ?? ''); continue; }
                index = afterOrAt(index, e.timing);
                break;
            }
            case 'DECISION_NUMBER': {
                const n = decisionOrdinal(e.anchorDecisionNumber);
                if (n == null) { unplaceable(e, 'decisionNumberNoDigits', e.anchorDecisionNumber ?? ''); continue; }
                if (!subjects.some(s => decisionOrdinal(s.decisionNumber) != null)) { unplaceable(e, 'noDecisionNumbers'); continue; }
                index = subjects.findIndex(s => { const o = decisionOrdinal(s.decisionNumber); return o != null && o >= n; });
                if (index < 0) {
                    // Past every printed decision: "after" that is after the last
                    // subject (no effect), not a data problem. Anything else is.
                    if (e.timing !== 'AFTER') { unplaceable(e, 'decisionNumberBeyond', String(n)); continue; }
                    index = subjects.length;
                    break;
                }
                index = afterOrAt(index, e.timing);
                break;
            }
            case 'PHASE': {
                if (e.anchorPhase === 'OUT_OF_AGENDA') {
                    index = subjects.findIndex(s => s.nonAgendaReason === 'outOfAgenda');
                    if (index < 0) { unplaceable(e, 'noOutOfAgenda'); continue; }
                } else index = 0;
                break;
            }
            case 'SESSION_START': index = 0; break;
            case 'SESSION_END': index = subjects.length; break;
        }
        placed.push({ event: e, effectAt: index });
    }
    return { placed, issues };
}
