import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InfoPanel } from '../InfoPanel';
import { captureLandingAction } from '@/lib/landing/analytics';
import type { GeneralSubjectRow, LandingListCity } from '@/lib/landing/landingData';

jest.mock('next-intl', () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return { useTranslations: () => t };
});
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: ReactNode; prefetch?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>{children}</a>
    ),
}));
jest.mock('@/lib/landing/analytics', () => ({ captureLandingAction: jest.fn() }));
// The doors slide with framer-motion; here they just render. `mockReducedMotion` flips the
// reduced-motion preference per test.
let mockReducedMotion = false;
jest.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: { span: ({ children, ...props }: { children: ReactNode }) => <span {...props}>{children}</span> },
    useReducedMotion: () => mockReducedMotion,
}));

const city = (id: string, name: string, councilMeetings = 3): LandingListCity => ({
    id,
    name,
    name_en: name,
    name_municipality: `Δήμος ${name}`,
    logoImage: null,
    _count: { persons: 0, parties: 0, councilMeetings },
});

const subject = (id: string, name: string): GeneralSubjectRow => ({
    id,
    name,
    description: '',
    cityId: 'chania',
    cityName: 'Χανιά',
    nameMunicipality: 'Δήμος Χανίων',
    logoImage: null,
    cityTimezone: 'Europe/Athens',
    councilMeetingId: 'm1',
    topicColor: '#888888',
});

const cities = [city('chania', 'Χανιά'), city('vrilissia', 'Βριλήσσια')];
const subjects = [subject('s1', 'Πεζόδρομος Χάληδων'), subject('s2', 'Νέο πάρκο')];

// The shuffle is random; read the shown item off the link's accessible name instead.
const shownName = (link: HTMLElement, prefix: string) => link.getAttribute('aria-label')!.slice(`${prefix}: `.length);

beforeEach(() => {
    jest.useFakeTimers();
    mockReducedMotion = false;
});
afterEach(() => jest.useRealTimers());

describe('InfoPanel', () => {
    it('opens four doors: the map, a δήμος, a subject and the explainer', () => {
        const onExploreMap = jest.fn();
        render(<InfoPanel cities={cities} subjects={subjects} explainAvailable onExploreMap={onExploreMap} />);
        fireEvent.click(screen.getByRole('button', { name: /info\.cta\.map/ }));
        expect(onExploreMap).toHaveBeenCalled();
        expect(screen.getByRole('link', { name: /^info\.cta\.city: / })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^info\.cta\.subject: / })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^info\.cta\.more/ })).toHaveAttribute('href', '/explain');
    });

    it('links each door to the very item it is showing, and moves on with time', () => {
        render(<InfoPanel cities={cities} subjects={subjects} explainAvailable onExploreMap={() => {}} />);
        const cityDoor = screen.getByRole('link', { name: /^info\.cta\.city: / });
        const first = shownName(cityDoor, 'info.cta.city');
        expect(cityDoor).toHaveAttribute('href', `/${cities.find((c) => c.name === first)!.id}`);

        act(() => {
            jest.advanceTimersByTime(2600);
        });
        const second = shownName(cityDoor, 'info.cta.city');
        expect(second).not.toBe(first);
        expect(cityDoor).toHaveAttribute('href', `/${cities.find((c) => c.name === second)!.id}`);

        const subjectDoor = screen.getByRole('link', { name: /^info\.cta\.subject: / });
        const shown = shownName(subjectDoor, 'info.cta.subject');
        // the subject door names the municipality too: "title (city)"
        const subject = subjects.find((s) => shown === `${s.name} (${s.cityName})`)!;
        expect(subjectDoor).toHaveAttribute('href', `/chania/m1/subjects/${subject.id}`);
    });

    it('keeps the two doors out of step: the subject door ticks half a beat after the δήμος door', () => {
        render(<InfoPanel cities={cities} subjects={subjects} explainAvailable onExploreMap={() => {}} />);
        const cityDoor = screen.getByRole('link', { name: /^info\.cta\.city: / });
        const subjectDoor = screen.getByRole('link', { name: /^info\.cta\.subject: / });
        const city0 = cityDoor.getAttribute('href');
        const subject0 = subjectDoor.getAttribute('href');
        act(() => {
            jest.advanceTimersByTime(2600);
        });
        expect(cityDoor.getAttribute('href')).not.toBe(city0);
        expect(subjectDoor.getAttribute('href')).toBe(subject0);
        act(() => {
            jest.advanceTimersByTime(1300);
        });
        expect(subjectDoor.getAttribute('href')).not.toBe(subject0);
    });

    it('holds still under the pointer, so what was seen is what opens', () => {
        render(<InfoPanel cities={cities} subjects={subjects} explainAvailable onExploreMap={() => {}} />);
        const cityDoor = screen.getByRole('link', { name: /^info\.cta\.city: / });
        const before = cityDoor.getAttribute('href');
        fireEvent.mouseEnter(cityDoor);
        act(() => {
            jest.advanceTimersByTime(2600 * 3);
        });
        expect(cityDoor).toHaveAttribute('href', before!);
    });

    it('writes the meeting down word by word, then makes its subjects', () => {
        const { container } = render(<InfoPanel cities={cities} subjects={subjects} explainAvailable onExploreMap={() => {}} />);
        const state = (sel: string) => [...container.querySelectorAll(sel)].map((el) => el.getAttribute('data-state'));
        // at the start nothing has been said and no subject made: placeholders and slots
        expect(state('[data-state="said"]')).toHaveLength(0);
        expect(state('[data-state="made"]')).toHaveLength(0);
        act(() => {
            for (let ms = 0; ms < 6000; ms += 16) jest.advanceTimersByTime(16);
        });
        expect(container.querySelectorAll('[data-state="pending"]')).toHaveLength(0);
        expect(container.querySelectorAll('[data-state="made"]')).toHaveLength(2);
    });

    it('stands still, finished, when motion is not welcome', () => {
        mockReducedMotion = true;
        const { container } = render(<InfoPanel cities={cities} subjects={subjects} explainAvailable onExploreMap={() => {}} />);
        expect(container.querySelectorAll('[data-state="pending"]')).toHaveLength(0);
        expect(container.querySelectorAll('[data-state="made"]')).toHaveLength(2);
        // the steps are real text, whatever the pictures do
        expect(screen.getByText('info.how.sort')).toBeInTheDocument();
    });

    it('offers the film where the realm has one, and plays it in a dialog', () => {
        const video = {
            src: 'https://data.opencouncil.gr/explain/film.mp4',
            poster: 'https://data.opencouncil.gr/explain/p.jpg',
            thumb: 'https://data.opencouncil.gr/explain/t.jpg',
            duration: '1:03',
        };
        render(<InfoPanel cities={cities} subjects={subjects} explainAvailable video={video} onExploreMap={() => {}} />);
        // nothing loads until asked
        expect(document.querySelector('video')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /info\.video\.cta/ }));
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent('info.video.title');
        expect(dialog.querySelector('video')).toHaveAttribute('src', video.src);
    });

    it('counts the explainer door with the other doors, and keeps its older event', () => {
        render(<InfoPanel cities={cities} subjects={subjects} explainAvailable onExploreMap={() => {}} />);
        fireEvent.click(screen.getByRole('link', { name: /^info\.cta\.more/ }));
        expect(captureLandingAction).toHaveBeenCalledWith('info_cta_clicked', { target: 'explain' });
        expect(captureLandingAction).toHaveBeenCalledWith('info_explain_clicked', {});
    });

    it('offers no film where the realm has none', () => {
        render(<InfoPanel cities={cities} subjects={subjects} explainAvailable video={null} onExploreMap={() => {}} />);
        expect(screen.queryByRole('button', { name: /info\.video\.cta/ })).toBeNull();
    });

    it('skips a δήμος with no meetings yet and a realm with no explainer', () => {
        render(
            <InfoPanel
                cities={[city('empty', 'Κενός', 0)]}
                subjects={[]}
                explainAvailable={false}
                onExploreMap={() => {}}
            />,
        );
        expect(screen.queryByRole('link', { name: /^info\.cta\.city: / })).toBeNull();
        expect(screen.queryByRole('link', { name: /^info\.cta\.subject: / })).toBeNull();
        expect(screen.getByRole('link', { name: /^info\.cta\.more/ })).toHaveAttribute('href', '/about#process');
    });
});
