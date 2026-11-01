import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhoneField } from '../phone-field';
import { realmForBrowser } from '@/lib/realm.client';

jest.mock('@/lib/realm.client', () => ({ realmForBrowser: jest.fn() }));

it.each([
    ['germany', 'Germany'], ['finland', 'Finland'], ['greece', 'Greece'], ['bosnia', 'Bosnia and Herzegovina'],
])('defaults an empty phone field to the %s realm country', (realm, country) => {
    jest.mocked(realmForBrowser).mockReturnValue(realm as ReturnType<typeof realmForBrowser>);
    render(<PhoneField value="" onChange={jest.fn()} placeholder="Mobile" />);
    fireEvent.focus(screen.getByPlaceholderText('Mobile'));
    expect(screen.getByRole('combobox')).toHaveAttribute('title', country);
});
