import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import CountrySwitcher from '../layout/CountrySwitcher';

beforeAll(() => {
    Element.prototype.scrollIntoView = jest.fn();
    Element.prototype.hasPointerCapture = jest.fn(() => false);
    Element.prototype.setPointerCapture = jest.fn();
    Element.prototype.releasePointerCapture = jest.fn();
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

function renderPicker(width: number) {
    window.innerWidth = width;
    render(<NextIntlClientProvider locale="en" messages={{ Footer: {
        selectCountry: 'Select country', searchCountry: 'Search countries', noCountries: 'No countries found.',
    } }}><CountrySwitcher realm="greece" /></NextIntlClientProvider>);
    const trigger = screen.getByRole('button', { name: /Ελλάδα/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
}

it('opens a searchable country dialog on mobile and closes when the current country is selected', async () => {
    renderPicker(390);
    const dialog = screen.getByRole('dialog', { name: 'Select country' });
    fireEvent.change(within(dialog).getByPlaceholderText('Search countries'), { target: { value: 'Bosnia' } });
    expect(within(dialog).getByRole('option', { name: 'Bosnia & Herzegovina' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: 'Germany' })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText('Search countries'), { target: { value: 'Ελλάδα' } });
    fireEvent.click(within(dialog).getByRole('option', { name: 'Ελλάδα' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Select country' })).not.toBeInTheDocument());
});

it('offers searchable countries in a popover on desktop', () => {
    renderPicker(1024);
    expect(screen.queryByRole('dialog', { name: 'Select country' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search countries'), { target: { value: 'Portugal' } });
    expect(screen.getByRole('option', { name: 'Portugal' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Germany' })).not.toBeInTheDocument();
});
