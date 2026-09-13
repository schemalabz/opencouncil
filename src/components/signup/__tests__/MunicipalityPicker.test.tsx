import { createElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CityMinimalWithCounts } from '@/lib/db/cities';
import { MunicipalityPicker } from '../MunicipalityPicker';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string | number>) =>
        values ? `${key} ${Object.values(values).join(' ')}` : key,
    useLocale: () => 'el',
}));
jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: { alt: string }) => createElement('img', { alt: props.alt }),
}));
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) =>
        createElement('a', { href, onClick }, children),
}));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

function city(id: string, name: string, extra: Partial<CityMinimalWithCounts> = {}): CityMinimalWithCounts {
    return {
        id,
        name,
        name_en: null,
        name_municipality: `Δήμος ${name}`,
        name_municipality_en: null,
        logoImage: null,
        supportsNotifications: true,
        status: 'customer',
        authorityType: 'municipality',
        timezone: 'Europe/Athens',
        _count: { councilMeetings: 0, persons: 0, parties: 0 },
        ...extra,
    } as CityMinimalWithCounts;
}

const athens = city('athens', 'Αθήνα');
const chania = city('chania', 'Χανιά');
const thessaloniki = city('thessaloniki', 'Θεσσαλονίκη', { supportsNotifications: false, status: 'pending' });
const patras = city('patras', 'Πάτρα', { supportsNotifications: false, status: 'pending' });
const larissa = city('larissa', 'Λάρισα', { supportsNotifications: false, status: 'pending' });
const cities = [athens, chania, thessaloniki, patras, larissa];
/** The landing map's ranked list: Πάτρα ahead of Θεσσαλονίκη, Λάρισα under the threshold. */
const petitioned = [
    { id: 'patras', bucket: 25 as const },
    { id: 'thessaloniki', bucket: 10 as const },
];
const nobody = { subscribedCityIds: [], petitionedCityIds: [] };

const search = () => screen.getByRole('searchbox', { name: 'picker.searchLabel' });
const rowNames = () => screen.getAllByRole('link').map((a) => a.textContent);

describe('MunicipalityPicker for notifications', () => {
    it('lists only the municipalities Νότης serves, each with a signup action', () => {
        render(<MunicipalityPicker cities={cities} mode="notifications" membership={nobody} />);

        expect(rowNames()).toEqual([expect.stringContaining('Αθήνα'), expect.stringContaining('Χανιά')]);
        expect(screen.getAllByText('picker.signUp')).toHaveLength(2);
        expect(screen.getByRole('link', { name: /Αθήνα/ })).toHaveAttribute('href', '/athens/notifications?step=2');
    });

    it('says which municipalities the reader is already in, and offers to change instead of join', () => {
        render(
            <MunicipalityPicker cities={cities} mode="notifications" membership={{ ...nobody, subscribedCityIds: ['athens'] }} />,
        );

        const row = screen.getByRole('link', { name: /Αθήνα/ });
        expect(within(row).getByText('picker.subscribed')).toBeInTheDocument();
        expect(within(row).getByText('picker.changePreferences')).toBeInTheDocument();
        expect(within(screen.getByRole('link', { name: /Χανιά/ })).getByText('picker.signUp')).toBeInTheDocument();
    });

    it('matches the start of a word, then anywhere once a few letters are in', () => {
        render(<MunicipalityPicker cities={cities} mode="notifications" membership={nobody} />);

        fireEvent.change(search(), { target: { value: 'θ' } });
        expect(screen.queryByRole('link', { name: /Αθήνα/ })).toBeNull();
        expect(screen.getByRole('link', { name: /Θεσσαλονίκη/ })).toBeInTheDocument();

        fireEvent.change(search(), { target: { value: 'θην' } });
        expect(screen.getByRole('link', { name: /Αθήνα/ })).toBeInTheDocument();
    });

    it('finds a municipality he does not serve, accent-insensitively, and offers the petition for it', () => {
        render(<MunicipalityPicker cities={cities} mode="notifications" membership={nobody} />);

        fireEvent.change(search(), { target: { value: 'θεσσαλονικη' } });

        expect(screen.getByText('picker.notSupportedYet')).toBeInTheDocument();
        const row = screen.getByRole('link', { name: /Θεσσαλονίκη/ });
        expect(row).toHaveAttribute('href', '/thessaloniki/petition?step=2');
        expect(within(row).getByText('picker.request')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /Αθήνα/ })).toBeNull();
    });

    it('offers the petition when nothing matches at all, with the query along', () => {
        render(<MunicipalityPicker cities={cities} mode="notifications" membership={nobody} />);

        fireEvent.change(search(), { target: { value: ' Ξάνθη ' } });

        expect(screen.getByText('picker.noResults Ξάνθη')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'picker.noResultsPetition' })).toHaveAttribute(
            'href',
            `/petition?q=${encodeURIComponent('Ξάνθη')}`,
        );
    });
});

describe('MunicipalityPicker for the petition', () => {
    it('lists the municipalities already being asked for, ranked, with their coarse counts', () => {
        render(<MunicipalityPicker cities={cities} mode="petition" membership={nobody} petitioned={petitioned} />);

        expect(rowNames()).toEqual([expect.stringContaining('Πάτρα'), expect.stringContaining('Θεσσαλονίκη')]);
        expect(screen.getByText('picker.petitioned 25')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Θεσσαλονίκη/ })).toHaveAttribute('href', '/thessaloniki/petition?step=2');
        expect(screen.getByText('picker.searchForYours')).toBeInTheDocument();
        expect(search()).toBeInTheDocument();
    });

    it('finds a municipality under the threshold by search, and keeps the asked-for ones on top', () => {
        render(<MunicipalityPicker cities={cities} mode="petition" membership={nobody} petitioned={petitioned} />);

        fireEvent.change(search(), { target: { value: 'Λάρ' } });
        expect(rowNames()).toEqual([expect.stringContaining('Λάρισα')]);
        expect(screen.queryByText('picker.searchForYours')).toBeNull();

        // «Δήμος …» matches every municipality name: the asked-for ones lead, in rank order.
        fireEvent.change(search(), { target: { value: 'δήμος' } });
        expect(rowNames().slice(0, 3)).toEqual([
            expect.stringContaining('Πάτρα'),
            expect.stringContaining('Θεσσαλονίκη'),
            expect.stringContaining('Λάρισα'),
        ]);
    });

    it('lists nothing before a search when no municipality is being asked for yet', () => {
        render(<MunicipalityPicker cities={cities} mode="petition" membership={nobody} />);

        expect(screen.queryAllByRole('link')).toHaveLength(0);
        fireEvent.change(search(), { target: { value: 'Θ' } });
        expect(rowNames()).toEqual([expect.stringContaining('Θεσσαλονίκη')]);
    });

    it('starts from the query the reader typed on the other picker', () => {
        render(<MunicipalityPicker cities={cities} mode="petition" membership={nobody} initialQuery="Ξάνθη" />);

        expect(search()).toHaveValue('Ξάνθη');
        expect(screen.getByText('picker.noResults Ξάνθη')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'picker.noResultsPetition' })).toBeNull();
    });

    it('lists the petitionable matches first and the served ones under their own label', () => {
        render(<MunicipalityPicker cities={cities} mode="petition" membership={{ ...nobody, petitionedCityIds: ['thessaloniki'] }} />);

        fireEvent.change(search(), { target: { value: 'Θεσ' } });
        expect(rowNames()).toEqual([expect.stringContaining('Θεσσαλονίκη')]);
        const row = screen.getByRole('link', { name: /Θεσσαλονίκη/ });
        expect(within(row).getByText('picker.requested')).toBeInTheDocument();
        expect(within(row).getByText('picker.changeRequest')).toBeInTheDocument();

        fireEvent.change(search(), { target: { value: 'Αθ' } });
        expect(screen.getByText('picker.supportedAlready')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Αθήνα/ })).toHaveAttribute('href', '/athens/notifications?step=2');
    });
});
