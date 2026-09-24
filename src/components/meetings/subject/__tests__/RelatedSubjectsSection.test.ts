// The section's contract is two lines that read like swallows: no neighbours
// on either level, or a failed fetch, and it stays off the page. These cases
// await the server component directly and read the element it returns.
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/search/core', () => ({ searchRelatedSubjectsInRealm: jest.fn() }));
jest.mock('@/lib/statistics', () => ({ getBatchStatisticsForSubjects: jest.fn() }));
jest.mock('../RelatedSubjects', () => ({ RelatedSubjects: jest.fn() }));

import { searchRelatedSubjectsInRealm } from '@/lib/search/core';
import { getBatchStatisticsForSubjects } from '@/lib/statistics';
import type { SearchResultLight } from '@/lib/search/types';
import { RelatedSubjectsSection } from '../RelatedSubjectsSection';
import type { RelatedCurrent, RelatedLevel } from '../RelatedSubjects';

const searchMock = searchRelatedSubjectsInRealm as jest.MockedFunction<typeof searchRelatedSubjectsInRealm>;
const statisticsMock = getBatchStatisticsForSubjects as jest.MockedFunction<typeof getBatchStatisticsForSubjects>;

const SEED = { id: 'seed', name: 'Κυκλοφοριακές ρυθμίσεις', cityId: 'athens', councilMeetingId: 'meeting-1' };
const CURRENT = { dateTime: '2026-02-15T00:00:00.000Z', administrativeBodyName: 'Δημοτικό Συμβούλιο', timezone: 'Europe/Athens' };

function subject(id: string, cityId: string, dateTime: string): SearchResultLight {
    return {
        id,
        cityId,
        councilMeetingId: `meeting-${dateTime}`,
        introducedBy: null,
        councilMeeting: { id: `meeting-${dateTime}`, cityId, dateTime: new Date(dateTime), city: { id: cityId }, administrativeBody: null },
    } as unknown as SearchResultLight;
}

let lastElement: unknown;

/** What the section handed to its client half: the props of the element it returned. */
function rendered(): { subjectId: string; current: RelatedCurrent; city?: RelatedLevel; other?: RelatedLevel } {
    return (lastElement as { props: ReturnType<typeof rendered> }).props;
}

async function render(city: SearchResultLight[] | Error, other: SearchResultLight[] | Error) {
    searchMock.mockImplementation(async (_seed, scope) => {
        const answer = scope === 'city' ? city : other;
        if (answer instanceof Error) throw answer;
        return answer;
    });
    lastElement = await RelatedSubjectsSection({ seed: SEED, current: CURRENT });
    return lastElement;
}

beforeEach(() => {
    jest.clearAllMocks();
    statisticsMock.mockImplementation(async ids => new Map(ids.map(id => [id, { speakingSeconds: 0, people: [] }])));
});

describe('RelatedSubjectsSection', () => {
    it('renders nothing when neither level has a subject', async () => {
        await expect(render([], [])).resolves.toBeNull();
        expect(statisticsMock).not.toHaveBeenCalled();
    });

    it('renders nothing when both lookups fail', async () => {
        await expect(render(new Error('index down'), new Error('index down'))).resolves.toBeNull();
    });

    it('counts a failed level as empty and shows the other', async () => {
        await render(new Error('index down'), [subject('b', 'chania', '2026-03-01')]);

        expect(rendered().city).toBeUndefined();
        expect(rendered().other?.subjects.map(s => s.id)).toEqual(['b']);
    });

    // Promise.all resolves the city level first, so the other-only case is
    // the one that would slip past a guard that reads the city level alone.
    it('passes a level only when it has subjects, other alone included', async () => {
        await render([], [subject('b', 'chania', '2026-03-01')]);

        expect(rendered().city).toBeUndefined();
        expect(rendered().other?.subjects.map(s => s.id)).toEqual(['b']);
    });

    // The city level is drawn as a timeline, so it has to arrive in meeting
    // order; the index ranks by similarity. The other level is a ranked list
    // and keeps the index's order.
    it('orders the same-municipality level by meeting date, oldest first, and leaves the other level ranked', async () => {
        await render(
            [subject('newest', 'athens', '2026-03-01'), subject('oldest', 'athens', '2023-01-01'), subject('middle', 'athens', '2025-06-01')],
            [subject('closest', 'chania', '2026-03-01'), subject('older', 'argos', '2020-01-01')],
        );

        expect(rendered().city?.subjects.map(s => s.id)).toEqual(['oldest', 'middle', 'newest']);
        expect(rendered().other?.subjects.map(s => s.id)).toEqual(['closest', 'older']);
    });

    it('hands the client the subject on screen, so the timeline can place it', async () => {
        await render([subject('a', 'athens', '2026-02-01')], []);

        expect(rendered().current).toEqual(CURRENT);
        expect(rendered().subjectId).toBe('seed');
    });

    // A speaker's party is read off the roles active on the meeting's date,
    // so subjects from different meetings cannot share one statistics call.
    it('asks for statistics per meeting date, so each row reads its speakers as of its own meeting', async () => {
        await render(
            [subject('a', 'athens', '2026-02-01'), subject('c', 'athens', '2026-02-01')],
            [subject('b', 'chania', '2026-03-01')],
        );

        expect(statisticsMock.mock.calls.map(([ids, date]) => [ids, date?.toISOString()])).toEqual([
            [['a', 'c'], '2026-02-01T00:00:00.000Z'],
            [['b'], '2026-03-01T00:00:00.000Z'],
        ]);
    });

    // The rows and their links are the crawler and no-JS payoff; a row without
    // statistics is a state the row already draws, so a failed group must not
    // take the section down.
    it('keeps the rows when one statistics group fails, without their statistics', async () => {
        statisticsMock.mockImplementation(async (ids, date) => {
            if (date?.toISOString().startsWith('2026-03')) throw new Error('pool timeout');
            return new Map(ids.map(id => [id, { speakingSeconds: 0, people: [] }]));
        });

        await render([subject('a', 'athens', '2026-02-01')], [subject('b', 'chania', '2026-03-01')]);

        expect(rendered().city?.subjects[0].statistics).toBeDefined();
        expect(rendered().other?.subjects.map(s => s.id)).toEqual(['b']);
        expect(rendered().other?.subjects[0].statistics).toBeUndefined();
    });
});
