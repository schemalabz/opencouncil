import { render, screen, fireEvent, within } from '@testing-library/react';
import { CityCombobox } from '../CityCombobox';

// jsdom lacks the pointer-capture APIs Radix Popover reaches for. The rest
// of what it needs (ResizeObserver, scrollIntoView) comes from jest.setup.js.
beforeAll(() => {
    Element.prototype.hasPointerCapture = jest.fn(() => false);
    Element.prototype.setPointerCapture = jest.fn();
    Element.prototype.releasePointerCapture = jest.fn();
    window.innerWidth = 1024; // -> Popover
});

const cities = [
    { id: 'athens', name: 'Αθήνα', name_en: 'Athens', name_municipality: 'Δήμος Αθηναίων' },
    { id: 'chania', name: 'Χανιά', name_en: 'Chania', name_municipality: 'Δήμος Χανίων' },
];

function openAndSearch(query: string) {
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Search cities...'), { target: { value: query } });
    return screen.getByRole('listbox');
}

describe('CityCombobox', () => {
    it('shows the selected city by id', () => {
        render(<CityCombobox cities={cities} value="chania" onChange={() => {}} />);
        expect(screen.getByRole('combobox')).toHaveTextContent('Χανιά');
    });

    it('finds a city by its English name', () => {
        render(<CityCombobox cities={cities} value={null} onChange={() => {}} />);
        const list = openAndSearch('athe');
        expect(within(list).getByText('Αθήνα')).toBeInTheDocument();
        expect(within(list).queryByText('Χανιά')).not.toBeInTheDocument();
    });

    it('finds a city by its municipality name', () => {
        render(<CityCombobox cities={cities} value={null} onChange={() => {}} />);
        const list = openAndSearch('χανιων');
        expect(within(list).getByText('Χανιά')).toBeInTheDocument();
        expect(within(list).queryByText('Αθήνα')).not.toBeInTheDocument();
    });

    it('reports the id of the picked city', () => {
        const onChange = jest.fn();
        render(<CityCombobox cities={cities} value={null} onChange={onChange} />);
        const list = openAndSearch('');
        fireEvent.click(within(list).getByText('Χανιά'));
        expect(onChange).toHaveBeenCalledWith('chania');
    });

    // Combobox sends null when the selected row is picked again. Nothing
    // changes then, whether or not the picker offers a "no city" row.
    it('does not change when the current city is picked again', () => {
        const onChange = jest.fn();
        render(<CityCombobox cities={cities} value="chania" onChange={onChange} />);
        const list = openAndSearch('');
        fireEvent.click(within(list).getByText('Χανιά'));
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('CityCombobox with a "no city" row', () => {
    const props = { cities, nullOption: 'All cities' } as const;

    it('labels the trigger with the row when no city is selected', () => {
        render(<CityCombobox {...props} value={null} onChange={() => {}} />);
        expect(screen.getByRole('combobox')).toHaveTextContent('All cities');
    });

    it('offers the row alongside the cities', () => {
        render(<CityCombobox {...props} value="chania" onChange={() => {}} />);
        const list = openAndSearch('');
        expect(within(list).getByText('All cities')).toBeInTheDocument();
        expect(within(list).getByText('Αθήνα')).toBeInTheDocument();
    });

    it('reports null when the row is picked', () => {
        const onChange = jest.fn();
        render(<CityCombobox {...props} value="chania" onChange={onChange} />);
        const list = openAndSearch('');
        fireEvent.click(within(list).getByText('All cities'));
        expect(onChange).toHaveBeenCalledWith(null);
    });

    it('still reports a city id when a city is picked', () => {
        const onChange = jest.fn();
        render(<CityCombobox {...props} value={null} onChange={onChange} />);
        const list = openAndSearch('');
        fireEvent.click(within(list).getByText('Αθήνα'));
        expect(onChange).toHaveBeenCalledWith('athens');
    });
});
