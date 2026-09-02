import { render, screen } from '@testing-library/react';
import { MeetingsTimeline } from '../cities/overview/MeetingsTimeline';
import type { CouncilMeetingWithSubjectPreview } from '@/lib/db/meetings';

jest.mock('next-intl', () => ({
    useTranslations: () => Object.assign(
        (key: string, params?: { count?: number; index?: number }) =>
            params?.count !== undefined ? `${key}:${params.count}`
                : params?.index !== undefined ? `#${params.index}`
                : key,
        { raw: (key: string) => key },
    ),
}));

// Icon resolves lucide's ESM-only dynamic imports, which jest cannot parse;
// the chip and row content are what this suite asserts, not the glyphs.
jest.mock('@/components/TopicIcon', () => ({
    TopicIcon: () => <span data-testid="topic-icon" />,
}));

jest.mock('@/i18n/routing', () => ({
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    Link: ({ href, children, ...rest }: React.ComponentProps<'a'>) => <a href={String(href)} {...rest}>{children}</a>,
    useRouter: () => ({ push: jest.fn() }),
}));

/** The dev database has no scheduled meetings, so the upcoming treatment — the
 *  dashed cards riding the top of the spine — is pinned here instead. */

const DAY = 24 * 60 * 60 * 1000;

let nextId = 0;
function meeting(overrides: {
    dateTime: Date;
    bodyType?: 'council' | 'committee' | 'community' | null;
    subjects?: Array<{ agendaItemIndex?: number | null; nonAgendaReason?: string | null; withdrawn?: boolean }>;
}): CouncilMeetingWithSubjectPreview {
    const { dateTime, bodyType = 'council', subjects = [] } = overrides;
    const id = `m${nextId++}`;
    return {
        id,
        cityId: 'athens',
        name: `Συνεδρίαση ${id}`,
        name_en: `Meeting ${id}`,
        dateTime,
        released: true,
        youtubeUrl: null,
        videoUrl: null,
        audioUrl: null,
        muxPlaybackId: null,
        taskStatuses: [],
        _count: { speakerSegments: 0 },
        administrativeBody: bodyType === null ? null : {
            id: `body-${bodyType}`,
            type: bodyType,
            name: bodyType === 'council' ? 'Δημοτικό Συμβούλιο' : 'Δημοτική Επιτροπή',
            name_en: bodyType === 'council' ? 'City Council' : 'City Committee',
        },
        subjects: subjects.map((s, i) => ({
            id: `${id}-s${i}`,
            name: `Θέμα ${i}`,
            agendaItemIndex: s.agendaItemIndex ?? null,
            nonAgendaReason: s.nonAgendaReason ?? null,
            withdrawn: s.withdrawn ?? false,
            topic: null,
            _count: { contributions: 0 },
        })),
    } as unknown as CouncilMeetingWithSubjectPreview;
}

const past = (days: number, rest: Omit<Parameters<typeof meeting>[0], 'dateTime'> = {}) =>
    meeting({ dateTime: new Date(Date.now() - days * DAY), ...rest });
const future = (days: number, rest: Omit<Parameters<typeof meeting>[0], 'dateTime'> = {}) =>
    meeting({ dateTime: new Date(Date.now() + days * DAY), ...rest });

function renderTimeline(upcoming: CouncilMeetingWithSubjectPreview[], recent: CouncilMeetingWithSubjectPreview[]) {
    return render(<MeetingsTimeline upcoming={upcoming} recent={recent} timezone="Europe/Athens" locale="el" />);
}

describe('MeetingsTimeline', () => {
    it('renders nothing at all for a city with no meetings', () => {
        const { container } = renderTimeline([], []);
        expect(container.innerHTML).toBe('');
    });

    it('marks a scheduled meeting as upcoming: dashed card, no held-meeting styling', () => {
        renderTimeline([future(3, { subjects: [{ agendaItemIndex: 1 }] })], [past(5)]);
        // Both variants (two-sided and rail) render the block, so query all.
        const links = screen.getAllByRole('link');
        const upcomingCards = links.filter(a => a.className.includes('border-dashed'));
        const pastCards = links.filter(a => !a.className.includes('border-dashed'));
        expect(upcomingCards.length).toBeGreaterThan(0);
        expect(pastCards.length).toBeGreaterThan(0);
    });

    it('tells the reader when a scheduled meeting has no published agenda yet', () => {
        renderTimeline([future(3)], [past(5, { subjects: [{ agendaItemIndex: 1 }] })]);
        expect(screen.getAllByText('timelineNoAgendaYet').length).toBeGreaterThan(0);
        // A held meeting with no subjects says something else entirely.
        renderTimeline([], [past(9)]);
        expect(screen.getAllByText('noSubjects').length).toBeGreaterThan(0);
    });

    it('labels every agenda state, and withdrawn wins over the item number', () => {
        renderTimeline([], [past(5, {
            subjects: [
                { agendaItemIndex: 12 },
                { nonAgendaReason: 'beforeAgenda' },
                { agendaItemIndex: 4, withdrawn: true },
            ],
        })]);
        expect(screen.getAllByText('categories.agenda.shortLabel #12').length).toBeGreaterThan(0);
        expect(screen.getAllByText('categories.beforeAgenda.shortLabel').length).toBeGreaterThan(0);
        expect(screen.getAllByText('withdrawnShort').length).toBeGreaterThan(0);
        expect(screen.queryByText('categories.agenda.shortLabel #4')).toBeNull();
    });

    it('never shows a community meeting, and vanishes when only communities met', () => {
        const { container } = renderTimeline([], [
            past(1, { bodyType: 'council', subjects: [{ agendaItemIndex: 1 }] }),
            past(2, { bodyType: 'community', subjects: [{ agendaItemIndex: 1 }] }),
        ]);
        // The council meeting renders in both variants; the community one in neither.
        expect(container.querySelectorAll('a[href="/athens/m' + (nextId - 2) + '"]').length).toBeGreaterThan(0);
        expect(container.querySelectorAll('a[href="/athens/m' + (nextId - 1) + '"]').length).toBe(0);

        const onlyCommunities = renderTimeline([], [past(3, { bodyType: 'community' })]);
        expect(onlyCommunities.container.innerHTML).toBe('');
    });

    it('goes two-sided only when both sides have meetings', () => {
        const both = renderTimeline([], [past(1, { bodyType: 'council' }), past(2, { bodyType: 'committee' })]);
        expect(both.container.querySelector('.hidden.xl\\:block')).not.toBeNull();
        both.unmount();

        const councilOnly = renderTimeline([], [past(1), past(2)]);
        expect(councilOnly.container.querySelector('.hidden.xl\\:block')).toBeNull();
    });

    it('caps a card at the preview count and reports the total', () => {
        renderTimeline([], [past(2, {
            subjects: Array.from({ length: 5 }, (_, i) => ({ agendaItemIndex: i + 1 })),
        })]);
        expect(screen.getAllByText('subjectsCount:5').length).toBeGreaterThan(0);
    });
});

describe('chronology', () => {
    it('renders furthest-future first, down through the past', () => {
        const now = Date.now();
        const farFuture = meeting({ dateTime: new Date(now + 10 * DAY) });
        const nearFuture = meeting({ dateTime: new Date(now + 2 * DAY) });
        const recentPast = meeting({ dateTime: new Date(now - 1 * DAY) });
        const olderPast = meeting({ dateTime: new Date(now - 8 * DAY) });

        // The query serves upcoming ascending and recent descending; the spine
        // must read top-to-bottom as future-to-past regardless.
        const { container } = renderTimeline([nearFuture, farFuture], [recentPast, olderPast]);

        const hrefs = Array.from(container.querySelectorAll('a[href]')).map(a => a.getAttribute('href'));
        const order = [farFuture, nearFuture, recentPast, olderPast].map(m => `/athens/${m.id}`);
        const firstIndexes = order.map(href => hrefs.indexOf(href));
        expect(firstIndexes.every(i => i >= 0)).toBe(true);
        expect([...firstIndexes].sort((a, b) => a - b)).toEqual(firstIndexes);
    });

    it('renders a meeting present in both lists once', () => {
        const now = Date.now();
        const crossing = meeting({ dateTime: new Date(now - 60 * 1000) });
        const { container } = renderTimeline([crossing], [crossing]);
        const cards = Array.from(container.querySelectorAll('a[href]'))
            .filter(a => a.getAttribute('href') === `/athens/${crossing.id}`);
        // Council-only entries render the single rail, so exactly one card.
        expect(cards.length).toBe(1);
    });
});
