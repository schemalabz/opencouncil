// The strip's contract is a floor and a window: it appears only when the same
// municipality discussed the subject enough times close to this meeting. These
// cases await the server component directly and read what it returns.
jest.mock('@/lib/realm.server', () => ({ getRealm: jest.fn().mockResolvedValue('greece') }));
jest.mock('@/lib/search/core', () => ({ searchRelatedSubjectsInRealm: jest.fn() }));
jest.mock('../RelatedRecurrenceLink', () => ({ RelatedRecurrenceLink: jest.fn() }));

import { searchRelatedSubjectsInRealm } from '@/lib/search/core';
import type { SearchResultLight } from '@/lib/search/types';
import { RECURRENCE_WINDOW_DAYS, RelatedRecurrenceStrip, recurringNeighbours } from '../RelatedRecurrenceStrip';

const searchMock = searchRelatedSubjectsInRealm as jest.MockedFunction<typeof searchRelatedSubjectsInRealm>;

const SEED = { id: 'seed', name: 'Κυκλοφοριακές ρυθμίσεις', cityId: 'athens', councilMeetingId: 'meeting-1' };
const MEETING = '2026-06-15T00:00:00.000Z';

const daysFrom = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000);

function subject(id: string, dateTime: Date): SearchResultLight {
    return { id, councilMeeting: { dateTime } } as unknown as SearchResultLight;
}

async function render(city: SearchResultLight[] | Error, other: SearchResultLight[] = []) {
    searchMock.mockImplementation(async (_seed, scope) => {
        const answer = scope === 'city' ? city : other;
        if (answer instanceof Error) throw answer;
        return answer;
    });
    return RelatedRecurrenceStrip({ seed: SEED, meetingDate: MEETING }) as Promise<{ props: { count: number } } | null>;
}

beforeEach(() => jest.clearAllMocks());

describe('recurringNeighbours', () => {
    it('keeps a neighbour on the edge of the window and drops one a day past it, on either side', () => {
        const around = new Date(MEETING);
        const neighbours = [
            subject('before-edge', daysFrom(MEETING, -RECURRENCE_WINDOW_DAYS)),
            subject('before-out', daysFrom(MEETING, -RECURRENCE_WINDOW_DAYS - 1)),
            subject('after-edge', daysFrom(MEETING, RECURRENCE_WINDOW_DAYS)),
            subject('after-out', daysFrom(MEETING, RECURRENCE_WINDOW_DAYS + 1)),
        ];

        expect(recurringNeighbours(neighbours, around).map(s => s.id)).toEqual(['before-edge', 'after-edge']);
    });
});

describe('RelatedRecurrenceStrip', () => {
    it('counts only the same municipality\'s neighbours inside the window', async () => {
        const element = await render(
            [subject('a', daysFrom(MEETING, -30)), subject('b', daysFrom(MEETING, 120)), subject('c', daysFrom(MEETING, -700))],
            [subject('elsewhere', daysFrom(MEETING, 1))],
        );

        expect(element?.props.count).toBe(2);
    });

    it('renders nothing below the floor', async () => {
        await expect(render([subject('a', daysFrom(MEETING, -30)), subject('c', daysFrom(MEETING, -700))])).resolves.toBeNull();
    });

    it('renders nothing when every neighbour is far from this meeting', async () => {
        await expect(render([subject('a', daysFrom(MEETING, -400)), subject('b', daysFrom(MEETING, 400))])).resolves.toBeNull();
    });

    it('renders nothing when the lookup fails', async () => {
        await expect(render(new Error('index down'))).resolves.toBeNull();
    });
});
