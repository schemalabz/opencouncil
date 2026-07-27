import { render, screen, fireEvent, within } from '@testing-library/react';
import { defaultFilter } from 'cmdk';
import Combobox from '../Combobox';

// Regression guard for #402: the shared Combobox must match Greek queries
// accent-insensitively. Before this fix, cmdk's default (accent-sensitive)
// filter was used, so typing the un-accented "αγιοι αναργυροι" found nothing.

// jsdom lacks the layout/pointer APIs Radix Popover + cmdk reach for.
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
    window.innerWidth = 1024; // desktop -> Popover path (not the mobile Dialog)
});

type City = { name: string; muni: string };

// Municipality-selector wiring (see MunicipalitySelector.tsx):
// value = "name name_municipality", label = name.
const cities: City[] = [
    { name: 'Άγιοι Ανάργυροι', muni: 'Δήμος Αγίων Αναργύρων-Καματερού' },
    { name: 'Θεσσαλονίκη', muni: 'Δήμος Θεσσαλονίκης' }, // decoy: must be filtered out
];

const ACCENTED = 'Άγιοι Ανάργυροι';
const DEACCENTED_QUERY = 'αγιοι αναργυροι';

function renderCombobox() {
    return render(
        <Combobox<City>
            items={cities}
            value={null}
            onChange={() => {}}
            placeholder="Επιλέξτε δήμο"
            searchPlaceholder="Αναζήτηση δήμου"
            getItemLabel={(c) => c.name}
            getItemValue={(c) => `${c.name} ${c.muni}`}
        />,
    );
}

function openAndSearch(query: string) {
    renderCombobox();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Αναζήτηση δήμου'), {
        target: { value: query },
    });
}

describe('Combobox accent-insensitive search (#402)', () => {
    // Documents *why* the query below is a valid guard: on the previous
    // implementation (cmdk default filter, no keywords) it scored 0 -> hidden.
    // If someone later swaps in a query the old filter would have matched,
    // this assertion fails and the guard below stops proving anything.
    it('the chosen query genuinely failed under the old (default) filter', () => {
        const value = `${ACCENTED} ${cities[0].muni}`;
        expect(defaultFilter!(value, DEACCENTED_QUERY, undefined)).toBe(0);
    });

    it('finds an accented item when typing the un-accented query', () => {
        openAndSearch(DEACCENTED_QUERY);
        const list = screen.getByRole('listbox');
        expect(within(list).getByText(ACCENTED)).toBeInTheDocument();
        expect(within(list).queryByText('Θεσσαλονίκη')).not.toBeInTheDocument();
    });

    it('shows the empty state when nothing matches', () => {
        openAndSearch('ζζζζζ');
        expect(screen.queryByText(ACCENTED)).not.toBeInTheDocument();
        expect(screen.queryByText('Θεσσαλονίκη')).not.toBeInTheDocument();
    });
});
