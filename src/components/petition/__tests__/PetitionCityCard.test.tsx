import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CityStatus } from '@prisma/client';
import { SignupCityCard } from '@/components/notifications/signup/SignupCityCard';
import { PetitionCityCard } from '../PetitionCityCard';

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
    Link: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: (e: unknown) => void }) =>
        createElement('a', { href, onClick }, children),
}));

const city = {
    id: 'agia-paraskevi',
    name: 'Αγία Παρασκευή',
    name_en: null,
    name_municipality: 'Δήμος Αγίας Παρασκευής',
    name_municipality_en: null,
    logoImage: null,
};
const supported = { ...city, status: 'supported' as CityStatus };

const changeLink = () => screen.getByRole('link', { name: 'changeCity' });

describe('PetitionCityCard', () => {
    it('names the municipality and says how many have asked', () => {
        render(<PetitionCityCard city={city} bucket={25} pickerQuery="" />);

        expect(screen.getByText('Δήμος Αγίας Παρασκευής')).toBeInTheDocument();
        expect(screen.getByText('petitionCount 25')).toBeInTheDocument();
    });

    it('says the municipality is not in the network when too few have asked', () => {
        render(<PetitionCityCard city={city} bucket={null} pickerQuery="" />);

        expect(screen.getByText('notInNetwork')).toBeInTheDocument();
    });

    it('sends the reader back to the list they picked from', () => {
        render(<PetitionCityCard city={city} bucket={10} pickerQuery=" Παρασκ " />);

        expect(changeLink()).toHaveAttribute('href', `/petition?q=${encodeURIComponent('Παρασκ')}`);
    });

    it('sends the reader to the bare picker when they did not search', () => {
        render(<PetitionCityCard city={city} bucket={10} pickerQuery="" />);

        expect(changeLink()).toHaveAttribute('href', '/petition');
    });

    it('takes the navigation away while a submit is in flight', () => {
        render(<PetitionCityCard city={city} bucket={10} pickerQuery="" submitting />);

        expect(screen.queryByRole('link', { name: 'changeCity' })).toBeNull();
        expect(screen.getByText('changeCity')).toBeInTheDocument();
    });

    it('asks before discarding answers, and stays put when the reader says no', () => {
        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
        render(<PetitionCityCard city={city} bucket={10} pickerQuery="" dirty />);

        const prevented = !fireEvent.click(changeLink());

        expect(confirmSpy).toHaveBeenCalledWith('leaveWarning');
        expect(prevented).toBe(true);
        confirmSpy.mockRestore();
    });

    it('does not ask when there is nothing to discard', () => {
        const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
        render(<PetitionCityCard city={city} bucket={10} pickerQuery="" />);

        fireEvent.click(changeLink());

        expect(confirmSpy).not.toHaveBeenCalled();
        confirmSpy.mockRestore();
    });
});

describe('SignupCityCard', () => {
    it('names the municipality and marks official support', () => {
        render(<SignupCityCard city={supported} pickerQuery="" />);

        expect(screen.getByText('Δήμος Αγίας Παρασκευής')).toBeInTheDocument();
        expect(screen.getByText('officialSupport')).toBeInTheDocument();
    });

    it('leaves the support line off a municipality that is not a customer', () => {
        render(<SignupCityCard city={{ ...supported, status: 'pending' as CityStatus }} pickerQuery="" />);

        expect(screen.queryByText('officialSupport')).toBeNull();
    });

    it('sends the reader back to its own picker, carrying the search', () => {
        render(<SignupCityCard city={supported} pickerQuery="Χαλ" />);

        expect(changeLink()).toHaveAttribute('href', `/notifications?q=${encodeURIComponent('Χαλ')}`);
    });
});
