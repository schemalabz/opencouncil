import { decisionsTableAvailable } from '../availability';
import type { PresentationKey } from '@/lib/meetingPresentation';

const decides = { kind: null, continuationOf: null };
const agendaItem = { agendaItemIndex: 1, nonAgendaReason: null };

describe('decisionsTableAvailable', () => {
    it.each<PresentationKey>(['upcoming', 'live', 'postponed', 'cancelled'])('hides the table on a meeting that is %s', stage => {
        expect(decisionsTableAvailable(stage, decides, [agendaItem])).toBe(false);
    });

    it.each<PresentationKey>(['waiting', 'transcribing', 'review', 'complete', 'archive', 'noRecording'])('offers the table once the meeting is %s', stage => {
        expect(decisionsTableAvailable(stage, decides, [agendaItem])).toBe(true);
    });

    it('hides the table on a kind of meeting that takes no decisions', () => {
        expect(decisionsTableAvailable('complete', { kind: 'accountability', continuationOf: null }, [agendaItem])).toBe(false);
    });

    it('hides the table when no subject is a row of it', () => {
        expect(decisionsTableAvailable('complete', decides, [{ agendaItemIndex: 3, nonAgendaReason: 'beforeAgenda' }])).toBe(false);
        expect(decisionsTableAvailable('complete', decides, [])).toBe(false);
    });

    it('counts a subject taken up out of the agenda as a row', () => {
        expect(decisionsTableAvailable('complete', decides, [{ agendaItemIndex: null, nonAgendaReason: 'outOfAgenda' }])).toBe(true);
    });
});
