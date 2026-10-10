import { fireEvent, render, screen } from '@testing-library/react';
import { BodyFollowChoices } from '../BodyFollowChoices';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => 'el',
}));

const youth = { id: 'ab_youth', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil' as const, cityId: 'chania' };
const other = { id: 'ab_other', name: 'Άλλο όργανο', name_en: 'Other body', type: 'youthCouncil' as const, cityId: 'chania' };

describe('BodyFollowChoices', () => {
    it('offers each body unticked, with the hint that its updates are opt-in', () => {
        render(<BodyFollowChoices bodies={[youth, other]} selected={[]} onChange={jest.fn()} />);

        expect(screen.getByText('bodies.hint')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Δημοτικό Συμβούλιο Νέων' })).not.toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Άλλο όργανο' })).not.toBeChecked();
    });

    it('adds a ticked body and removes an unticked one', () => {
        const onChange = jest.fn();
        render(<BodyFollowChoices bodies={[youth, other]} selected={[youth]} onChange={onChange} />);

        expect(screen.getByRole('checkbox', { name: 'Δημοτικό Συμβούλιο Νέων' })).toBeChecked();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Άλλο όργανο' }));
        expect(onChange).toHaveBeenLastCalledWith([youth, other]);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Δημοτικό Συμβούλιο Νέων' }));
        expect(onChange).toHaveBeenLastCalledWith([]);
    });
});
