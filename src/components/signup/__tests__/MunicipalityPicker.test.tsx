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
const cities = [athens, chania, thessaloniki];
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

    it('offers the petition when nothing matches at all', () => {
        render(<MunicipalityPicker cities={cities} mode="notifications" membership={nobody} />);

        fireEvent.change(search(), { target: { value: 'Ξάνθη' } });

        expect(screen.getByText('picker.noResults Ξάνθη')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'picker.noResultsPetition' })).toHaveAttribute('href', '/petition');
    });
});

describe('MunicipalityPicker for the petition', () => {
    it('lists every municipality that can be asked for, with the search on top', () => {
        render(<MunicipalityPicker cities={cities} mode="petition" membership={nobody} />);

        expect(rowNames()).toEqual([expect.stringContaining('Θεσσαλονίκη')]);
        expect(screen.getByRole('link', { name: /Θεσσαλονίκη/ })).toHaveAttribute('href', '/thessaloniki/petition?step=2');
        expect(search()).toBeInTheDocument();
    });

    it('lists the petitionable matches first and the served ones under their own label', () => {
        render(<MunicipalityPicker cities={cities} mode="petition" membership={{ ...nobody, petitionedCityIds: ['thessaloniki'] }} />);

        fireEvent.change(search(), { target: { value: 'Θ' } });
        expect(rowNames()).toEqual([expect.stringContaining('Θεσσαλονίκη')]);
        const row = screen.getByRole('link', { name: /Θεσσαλονίκη/ });
        expect(within(row).getByText('picker.requested')).toBeInTheDocument();
        expect(within(row).getByText('picker.changeRequest')).toBeInTheDocument();

        fireEvent.change(search(), { target: { value: 'Αθ' } });
        expect(screen.getByText('picker.supportedAlready')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Αθήνα/ })).toHaveAttribute('href', '/athens/notifications?step=2');
    });
});
