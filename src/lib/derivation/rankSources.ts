import { placeEvents } from './placeEvents';
import { sourceRank } from './types';
import type { EventRow, Issue, OrderedSubject } from './types';

/**
 * The session's changes from every source, one account per person.
 *
 * `settleEventsAt` in the replay only compares events that land at the same
 * point of the order, so two sources stating one member's arrival at two
 * different items would both apply and the earlier one would win by accident.
 * The rule here: for each person, the highest-precedence source that states any
 * change for that person supplies all of that person's changes. A lower source's
 * change that lands at the same point with the same kind corroborates it and is
 * dropped without a word; any other change of a lower source is dropped and
 * reported as SOURCES_DISAGREE, with both sentences, so the reviewer can open
 * the recording, the sheet or the document and decide.
 *
 * A source that states nothing about a person is not a disagreement: the person
 * arrived when the only source that noticed says so.
 */
export function rankEvents(subjects: OrderedSubject[], events: EventRow[]): { events: EventRow[]; issues: Issue[] } {
    const issues: Issue[] = [];
    const { placed } = placeEvents(subjects, events);
    const effectAt = new Map<EventRow, number>(placed.map(p => [p.event, p.effectAt]));

    const byPerson = new Map<string, EventRow[]>();
    for (const e of events) byPerson.set(e.personId, [...(byPerson.get(e.personId) ?? []), e]);

    const kept = new Set<EventRow>();
    for (const personEvents of byPerson.values()) {
        const winningSource = personEvents.map(e => e.source).reduce((a, b) => (sourceRank(b) < sourceRank(a) ? b : a));
        const winners = personEvents.filter(e => e.source === winningSource);
        for (const w of winners) kept.add(w);
        for (const lose of personEvents) {
            if (lose.source === winningSource) continue;
            const at = effectAt.get(lose);
            const corroborated = at !== undefined && winners.some(w => w.kind === lose.kind && effectAt.get(w) === at);
            if (corroborated) continue;
            // The winner's sentence about the same kind of change, when it has one; else its first.
            const win = winners.find(w => w.kind === lose.kind) ?? winners[0];
            issues.push({
                code: 'SOURCES_DISAGREE', personId: lose.personId, source: winningSource, rawText: lose.rawText, evidence: lose.evidence,
                params: { kind: 'eventPosition', winSource: winningSource, winRawText: win.rawText, loseSource: lose.source, loseRawText: lose.rawText },
            });
        }
    }
    // A dropped event that cannot be placed is reported once, from a placement of the dropped events alone.
    issues.push(...placeEvents(subjects, events.filter(e => !kept.has(e))).issues.filter(i => i.code === 'UNPLACEABLE_ANCHOR'));
    return { events: events.filter(e => kept.has(e)), issues };
}
