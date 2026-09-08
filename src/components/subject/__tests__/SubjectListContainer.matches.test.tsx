import { render, screen, waitFor } from '@testing-library/react';
import { SubjectListContainer } from '../SubjectListContainer';
import type { SearchResultLight } from '@/lib/search/types';
import { MATCH_START, MATCH_END } from '@/lib/search/constants';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'el' }));
jest.mock('@/i18n/routing', () => ({
    useRouter: () => ({ push: jest.fn() }),
    Link: ({ children, href }: React.PropsWithChildren<{ href: string }>) => <a href={href}>{children}</a>,
}));
jest.mock('next/navigation', () => ({
    usePathname: () => '/search',
    useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/statistics', () => ({ getBatchStatisticsForSubjects: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('@/components/TopicIcon', () => ({ TopicIcon: () => <span data-testid="topic-icon" /> }));
jest.mock('@/components/persons/PersonAvatarList', () => ({ PersonAvatarList: () => null }));
jest.mock('@/components/meetings/HighlightVideo', () => ({ HighlightVideo: () => null }));
// A row lights its runs on the playback bar; that context reaches prisma and
// env.mjs, neither of which ts-jest can parse. The emphasis under test is
// independent of the hover.
jest.mock('@/components/meetings/bar/BarHighlightContext', () => ({
    useSubjectBarHover: () => ({ onMouseEnter: undefined, onMouseLeave: undefined }),
}));

const mark = (s: string) => `${MATCH_START}${s}${MATCH_END}`;
const NAME = 'Αίτηση για Αδειοδότηση καταστήματος';
const DESCRIPTION = 'Συζήτηση για την **άδεια** λειτουργίας καταστήματος';

const makeSubject = (overrides: Partial<SearchResultLight> = {}): SearchResultLight =>
    ({
        id: 'subj-1', cityId: 'athens', councilMeetingId: 'm1',
        name: NAME, name_en: '', description: DESCRIPTION, description_en: '',
        agendaItemIndex: 3, nonAgendaReason: null, withdrawn: false, hot: false,
        topicId: null, topic: null, locationId: null, location: null, personId: null, introducedBy: null,
        contributions: [], highlights: [], decision: null, discussedIn: null, votes: [], attendance: [],
        score: 1,
        councilMeeting: {
            id: 'm1', cityId: 'athens', name: 'Δημοτικό Συμβούλιο', name_en: 'City Council',
            dateTime: new Date('2026-01-15T16:00:00Z'), released: true,
            city: { id: 'athens', name: 'Αθήνα', name_en: 'Athens', timezone: 'Europe/Athens' },
            administrativeBody: null,
        },
        ...overrides,
    }) as unknown as SearchResultLight;

const matched = () => makeSubject({
    matches: {
        name: `Αίτηση για ${mark('Αδειοδότηση')} καταστήματος`,
        description: `Συζήτηση για την **${mark('άδεια')}** λειτουργίας καταστήματος`,
    },
});

beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => [] })) as unknown as typeof fetch;
});

async function renderList(variant: 'row' | 'card', subject: SearchResultLight) {
    const utils = render(<SubjectListContainer subjects={[subject]} variant={variant} layout="list" />);
    await waitFor(() => expect(screen.getByText(/Αίτηση για/)).toBeInTheDocument());
    return utils;
}
const markedTexts = (c: HTMLElement) => Array.from(c.querySelectorAll('mark')).map(el => el.textContent);

// Both variants, because /search renders `row` and only `card` was ever wired.
describe.each(['row', 'card'] as const)('SubjectListContainer variant=%s', (variant) => {
    it('emphasizes the matched term of the title', async () => {
        const { container } = await renderList(variant, matched());
        expect(markedTexts(container)).toContain('Αδειοδότηση');
    });

    it('emphasizes the matched term of the description, with the markdown stripped', async () => {
        const { container } = await renderList(variant, matched());
        expect(markedTexts(container)).toContain('άδεια');
        expect(container.textContent).not.toContain('**');
    });

    it('leaks no marker into the page', async () => {
        const { container } = await renderList(variant, matched());
        expect(container.textContent).not.toContain(MATCH_START);
        expect(container.textContent).not.toContain(MATCH_END);
    });

    it('emphasizes the matched term of the location', async () => {
        const subject = makeSubject({
            location: { text: 'Καλαθάς, Χανιά' },
            matches: { location_text: `${mark('Καλαθάς')}, Χανιά` },
        } as Partial<SearchResultLight>);
        const { container } = await renderList(variant, subject);
        expect(markedTexts(container)).toContain('Καλαθάς');
    });

    it('emphasizes nothing when the hit carries no matches', async () => {
        const { container } = await renderList(variant, makeSubject());
        expect(container.querySelector('mark')).toBeNull();
        expect(screen.getByText(/Αίτηση για/)).toHaveTextContent(NAME);
    });
});
