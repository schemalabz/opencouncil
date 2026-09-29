import { rankEvents } from '../rankSources';
import type { EventRow, OrderedSubject } from '../types';

const subjects: OrderedSubject[] = [1, 2, 3, 4].map(i => ({ id: `s${i}`, name: `Θέμα ${i}`, agendaItemIndex: i, nonAgendaReason: null, decisionNumber: null }));
let n = 0;
const ev = (o: Partial<EventRow> & { personId: string; source: EventRow['source'] }): EventRow => ({
    id: `e${++n}`, kind: 'ARRIVAL', anchorKind: 'AGENDA_ITEM', anchorAgendaItemIndex: 2, anchorNonAgendaReason: null, anchorDecisionNumber: null,
    anchorSubjectId: null, anchorPhase: null, timing: 'BEFORE', rawText: `${o.source}: ${o.kind ?? 'ARRIVAL'} at ${o.anchorAgendaItemIndex ?? 2}`,
    reportingDocuments: 1, totalDocuments: 1, ...o,
});

describe('rankEvents', () => {
    it('keeps every source when they state different people', () => {
        const events = [ev({ personId: 'a', source: 'sheet' }), ev({ personId: 'b', source: 'transcript' })];
        const r = rankEvents(subjects, events);
        expect(r.events).toEqual(events);
        expect(r.issues).toEqual([]);
    });

    it('a lower source that lands at the same point with the same kind corroborates and says nothing', () => {
        const sheet = ev({ personId: 'a', source: 'sheet', anchorAgendaItemIndex: 2, timing: 'BEFORE' });
        // «during item 2» takes effect at item 2 as well.
        const transcript = ev({ personId: 'a', source: 'transcript', anchorAgendaItemIndex: 2, timing: 'DURING' });
        const r = rankEvents(subjects, [sheet, transcript]);
        expect(r.events).toEqual([sheet]);
        expect(r.issues).toEqual([]);
    });

    it('a lower source that puts the change elsewhere is dropped and reported with both sentences', () => {
        const sheet = ev({ personId: 'a', source: 'sheet', anchorAgendaItemIndex: 3 });
        const transcript = ev({ personId: 'a', source: 'transcript', anchorAgendaItemIndex: 2, evidence: { utteranceId: 'u1' } });
        const r = rankEvents(subjects, [transcript, sheet]);
        expect(r.events).toEqual([sheet]);
        expect(r.issues).toEqual([expect.objectContaining({
            code: 'SOURCES_DISAGREE', personId: 'a', source: 'sheet', rawText: transcript.rawText, evidence: { utteranceId: 'u1' },
            params: { kind: 'eventPosition', winSource: 'sheet', winRawText: sheet.rawText, loseSource: 'transcript', loseRawText: transcript.rawText },
        })]);
    });

    it('the pages outrank the sheet, and a manual row outranks the pages', () => {
        const page = ev({ personId: 'a', source: 'decision', anchorAgendaItemIndex: 2 });
        const sheet = ev({ personId: 'a', source: 'sheet', anchorAgendaItemIndex: 3 });
        expect(rankEvents(subjects, [sheet, page]).events).toEqual([page]);
        const manual = ev({ personId: 'a', source: 'manual', kind: 'DEPARTURE', anchorAgendaItemIndex: 4 });
        const r = rankEvents(subjects, [sheet, page, manual]);
        expect(r.events).toEqual([manual]);
        expect(r.issues.map(i => i.code)).toEqual(['SOURCES_DISAGREE', 'SOURCES_DISAGREE']);
    });

    it('the winner supplies all of a person\'s changes, including a kind the loser states alone', () => {
        const sheetArrival = ev({ personId: 'a', source: 'sheet', anchorAgendaItemIndex: 2 });
        const transcriptDeparture = ev({ personId: 'a', source: 'transcript', kind: 'DEPARTURE', anchorAgendaItemIndex: 4 });
        const r = rankEvents(subjects, [sheetArrival, transcriptDeparture]);
        expect(r.events).toEqual([sheetArrival]);
        expect(r.issues[0]).toMatchObject({ params: { kind: 'eventPosition', winRawText: sheetArrival.rawText, loseRawText: transcriptDeparture.rawText } });
    });
});

describe('rankEvents reports the dropped events it cannot place', () => {
    it('a dropped event with an anchor no subject matches is reported once, and a kept twin of it is not', () => {
        const sheet = ev({ personId: 'a', source: 'sheet', anchorAgendaItemIndex: 2, rawText: 'προσήλθε στο 2ο' });
        const lost = ev({ personId: 'a', source: 'transcript', anchorAgendaItemIndex: 9, rawText: 'προσήλθε στο 2ο' });
        const r = rankEvents(subjects, [sheet, lost]);
        expect(r.events).toEqual([sheet]);
        expect(r.issues.filter(i => i.code === 'UNPLACEABLE_ANCHOR')).toEqual([expect.objectContaining({ personId: 'a', source: 'transcript', rawText: 'προσήλθε στο 2ο' })]);
    });
});
