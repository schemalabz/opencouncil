import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SubjectPicker, type SubjectPickerProps } from '@/components/meetings/decisions/SubjectPicker';
import admin from '../../../../../messages/el/admin.json';

const props: SubjectPickerProps = {
    decisionNumber: '672/2026',
    subjects: [],
    query: '',
    onQueryChange: jest.fn(),
    onPick: jest.fn(),
    onDismiss: jest.fn(),
    onClose: jest.fn(),
    saving: false,
};

const renderPicker = (over: Partial<SubjectPickerProps> = {}) => render(
    <NextIntlClientProvider locale="el" messages={{ admin }}>
        <SubjectPicker {...props} {...over} />
    </NextIntlClientProvider>,
);

const subject = {
    id: 's1', label: 'το θέμα 12', hasAgendaNumber: true, name: 'Έγκριση απολογισμού', likely: false, waitingAnswer: false,
};

describe('SubjectPicker', () => {
    it('lists the subjects still without a decision and counts them', () => {
        renderPicker({ subjects: [subject] });
        expect(screen.getByText(/Παρακάτω είναι μόνο το 1 θέμα/)).toBeInTheDocument();
        // The accessible name names the decision, the way the link panel's own
        // rows do; the visible text is what has to fit the button.
        const button = screen.getByRole('button', { name: 'Σύνδεση της απόφασης 672/2026 με το θέμα 12' });
        expect(button).toHaveTextContent('Σύνδεση με το θέμα 12');
    });

    it('falls back to a plain button label for a subject with no agenda number', () => {
        // Its label is «το θέμα «{name}»» — a whole subject name inside a
        // button, which is what pushed these rows into overflow.
        const named = {
            ...subject,
            label: 'το θέμα «Ανάθεση υπηρεσιών καθαριότητας σε ιδιώτη»',
            hasAgendaNumber: false,
            name: 'Ανάθεση υπηρεσιών καθαριότητας σε ιδιώτη',
        };
        renderPicker({ subjects: [named] });
        const button = screen.getByRole('button', { name: `Σύνδεση της απόφασης 672/2026 με ${named.label}` });
        expect(button.textContent).toBe('Σύνδεση');
        // The name is on the row, so the row never prints it twice.
        expect(screen.getByTitle(named.name)).toHaveTextContent(named.name);
        expect(screen.queryByText(named.label)).not.toBeInTheDocument();
    });

    it('explains an all-linked meeting instead of counting zero subjects', () => {
        // The common case for a ψήφισμα: every agenda item is answered, so the
        // list has nothing to show and "0 θέματα" would read as a fault.
        renderPicker();
        expect(screen.getByText(/Κάθε θέμα της συνεδρίασης έχει ήδη απόφαση/)).toBeInTheDocument();
        expect(screen.queryByText(/μόνο τα 0 θέματα/)).not.toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        // The answer the sentence points at has to be on screen.
        expect(screen.getByRole('button', { name: 'Δεν αφορά τη συνεδρίαση' })).toBeInTheDocument();
    });

    // The picker opens inside the questions card, which has no Θέμα column at
    // any width. `LinkPanel`'s table-alignment indent would line it up with
    // nothing here, and on a phone it would eat a third of the card.
    it('opens at the questions card’s own padding, with no column to align to', () => {
        const { container } = renderPicker({ subjects: [subject] });
        const shell = container.firstElementChild;
        expect(shell).toHaveClass('px-5');
        expect(shell?.className).not.toMatch(/(^| )(md:)?pl-20( |$)/);
    });

    it('says a search matched nothing, and keeps the search box to change it', () => {
        renderPicker({ query: '31' });
        expect(screen.getByText(/δεν ταιριάζει με 31/)).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
});
