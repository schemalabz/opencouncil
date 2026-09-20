import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { LinkPanel } from '../LinkPanel';
import messages from '../../../../../messages/el/admin.json';

const candidate = { id: 'c1', decisionNumber: '670/2026', title: 'Έγκριση απόφασης Δημάρχου', ada: 'ΨΞΚ1', publishDate: '2026-07-24' };
const props = {
    subjectLabel: 'το θέμα 30',
    hasAgendaNumber: true,
    current: null,
    rows: [{ kind: 'free' as const, candidate, likely: true, elsewhere: null }],
    query: '',
    onQueryChange: jest.fn(),
    confirm: null,
    onAskConfirm: jest.fn(),
    onCancelConfirm: jest.fn(),
    onConfirm: jest.fn(),
    onLink: jest.fn(),
    onAdaSubmit: jest.fn(),
    onOpenDocument: jest.fn(),
    onClose: jest.fn(),
    saving: false,
    error: null,
    onRetry: jest.fn(),
};

const renderPanel = (overrides = {}) => render(
    <NextIntlClientProvider locale="el" messages={{ admin: messages }}>
        <LinkPanel {...props} {...overrides} />
    </NextIntlClientProvider>,
);

describe('LinkPanel', () => {
    it('asks which decision belongs to this subject, naming it', () => {
        renderPanel();
        expect(screen.getByRole('heading', { name: /Ποια απόφαση αντιστοιχεί στο θέμα 30/ })).toBeInTheDocument();
    });

    it('marks the resolver proposal without showing a number', () => {
        renderPanel();
        expect(screen.getByText('Μάλλον ταιριάζει')).toBeInTheDocument();
        expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    });

    it('links a free decision straight away, with no confirmation in between', async () => {
        const onLink = jest.fn();
        renderPanel({ onLink });
        await userEvent.click(screen.getByRole('button', { name: 'Σύνδεση της απόφασης 670/2026 με το θέμα 30' }));
        expect(onLink).toHaveBeenCalledWith('c1');
        expect(props.onAskConfirm).not.toHaveBeenCalled();
    });

    it('asks before taking a decision another subject holds', async () => {
        const onAskConfirm = jest.fn();
        renderPanel({
            onAskConfirm,
            rows: [{ kind: 'linkedElsewhere' as const, candidate, likely: false, elsewhere: { id: 's2', label: 'το θέμα 24' } }],
        });
        await userEvent.click(screen.getByRole('button', { name: 'Μεταφορά της απόφασης 670/2026 στο θέμα 30' }));
        expect(onAskConfirm).toHaveBeenCalledWith({ kind: 'move', candidateId: 'c1', from: 'το θέμα 24' });
    });

    it('says a move empties the other row before it happens', () => {
        renderPanel({ confirm: { kind: 'move', candidateId: 'c1', from: 'το θέμα 24' } });
        expect(screen.getByText(/μένει χωρίς απόφαση/)).toBeInTheDocument();
    });

    it('warns that a hand-added decision is deleted for good, not returned', () => {
        renderPanel({
            current: { id: 'current1', number: '723', title: null, reversible: false },
            confirm: { kind: 'unlink', current: { number: '723', reversible: false } },
        });
        expect(screen.getByText(/διαγράφεται οριστικά/)).toBeInTheDocument();
    });

    it('promises a Diavgeia decision comes back, when it does', () => {
        renderPanel({
            current: { id: 'current1', number: '643/2026', title: null, reversible: true },
            confirm: { kind: 'unlink', current: { number: '643/2026', reversible: true } },
        });
        expect(screen.getByText(/επιστρέφει στις αποφάσεις χωρίς θέμα/)).toBeInTheDocument();
    });

    it('opens the current decision by its id, not its number', async () => {
        const onOpenDocument = jest.fn();
        renderPanel({
            current: { id: 'current1', number: '723', title: null, reversible: false },
            rows: [],
            onOpenDocument,
        });
        await userEvent.click(screen.getByRole('button', { name: 'Άνοιγμα εγγράφου της απόφασης 723' }));
        expect(onOpenDocument).toHaveBeenCalledWith('current1');
    });

    it('renders correctly for a subject with no agenda number', () => {
        renderPanel({ subjectLabel: 'το θέμα «Πληρεξουσιότητα Τακόπουλου»', hasAgendaNumber: false });
        expect(
            screen.getByRole('heading', { name: 'Ποια απόφαση αντιστοιχεί στο θέμα «Πληρεξουσιότητα Τακόπουλου»;' }),
        ).toBeInTheDocument();
    });

    it('names the primary row button with the subject when it has an agenda number', () => {
        renderPanel();
        // The aria-label always names the decision, so the visible text —
        // what would actually overflow the button — is asserted separately.
        const button = screen.getByRole('button', { name: 'Σύνδεση της απόφασης 670/2026 με το θέμα 30' });
        expect(button).toHaveTextContent('Σύνδεση με το θέμα 30');
    });

    it('falls back to a plain button label when the subject has no agenda number', () => {
        // A named subject's full label ("το θέμα «Ανάθεση υπηρεσιών
        // καθαριότητας σε ιδιώτη»") does not fit a button — see
        // QuestionsCard's `hasAgendaNumber` for the established pattern.
        const subjectLabel = 'το θέμα «Ανάθεση υπηρεσιών καθαριότητας σε ιδιώτη»';
        renderPanel({ subjectLabel, hasAgendaNumber: false });
        const button = screen.getByRole('button', {
            name: `Σύνδεση της απόφασης 670/2026 με ${subjectLabel}`,
        });
        expect(button.textContent).toBe('Σύνδεση');
    });

    it('shows the outgoing and incoming numbers when replacing a linked decision', () => {
        renderPanel({
            current: { id: 'current1', number: '723', title: null, reversible: true },
            confirm: { kind: 'replace', candidateId: 'c1', current: { number: '723', reversible: true } },
        });
        expect(screen.getByText('723')).toHaveClass('line-through');
        expect(screen.getByText('670/2026')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Αντικατάσταση' })).toBeInTheDocument();
    });

    it('names each row control by the decision it acts on', () => {
        // Eight rows of "Άνοιγμα" and "Σύνδεση" are one control repeated, as
        // far as a screen reader listing them can tell.
        const second = { id: 'c2', decisionNumber: '671/2026', title: 'Άλλη', ada: 'ΨΞΚ2', publishDate: null };
        renderPanel({
            rows: [
                { kind: 'free' as const, candidate, likely: true, elsewhere: null },
                { kind: 'free' as const, candidate: second, likely: false, elsewhere: null },
            ],
        });
        expect(screen.getByRole('button', { name: 'Άνοιγμα εγγράφου της απόφασης 670/2026' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Άνοιγμα εγγράφου της απόφασης 671/2026' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Σύνδεση της απόφασης 671/2026 με το θέμα 30' })).toBeInTheDocument();
    });

    it('gives a candidate row its title in full, and on hover when it is shortened', () => {
        // The title used to share one flex line with the chip, the date, the
        // open link and the action button, which cut it to a few characters.
        const long = { ...candidate, title: 'Έγκριση παροχής εντολής και πληρεξουσιότητας σε δικηγόρο για υπόθεση συμβασιούχων' };
        renderPanel({ rows: [{ kind: 'free' as const, candidate: long, likely: false, elsewhere: null }] });
        expect(screen.getByTitle(long.title)).toHaveTextContent(long.title);
    });

    it('explains an empty result and offers the way out', () => {
        renderPanel({ rows: [], query: '689' });
        expect(screen.getByText(/Καμία απόφαση με αριθμό 689/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Προσθήκη με ΑΔΑ/ })).toBeInTheDocument();
    });

    it('keeps the panel open on a failure and says nothing changed', () => {
        renderPanel({ error: 'boom' });
        expect(screen.getByText(/Δεν άλλαξε τίποτα/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Δοκιμή ξανά/ })).toBeInTheDocument();
    });

    // jsdom applies no stylesheet, so this checks the class the panel carries,
    // not a measured indent. The panel opens under a table row, so it lines its
    // contents up with the Θέμα column — from `md` up, where that column exists.
    it('carries the table-alignment indent, at the width where the column exists', () => {
        const { container } = renderPanel();
        expect(container.firstElementChild).toHaveClass('md:pl-20');
        expect(container.firstElementChild?.className).not.toMatch(/(^| )pl-20( |$)/);
    });

    it('keeps that indent on the confirmation strip, so the strip does not jump', () => {
        const { container } = renderPanel({ confirm: { kind: 'move', candidateId: 'c1', from: 'το θέμα 24' } });
        expect(container.firstElementChild).toHaveClass('md:pl-20');
    });

    it('shows a failure from the ΑΔΑ form while that form is open, not just the search list', async () => {
        // The error strip used to live inside the branch rendered only when
        // the ΑΔΑ form was closed — a write submitted from the open ΑΔΑ form
        // could fail and leave nothing on screen to say so.
        renderPanel({ error: 'Η απόφαση ΨΞΚ1ΩΗΔ-Α1Β είναι ήδη συνδεδεμένη με το θέμα 30.' });
        await userEvent.click(screen.getByRole('button', { name: /Προσθήκη με ΑΔΑ/ }));
        expect(screen.getByRole('heading', { name: /Προσθήκη απόφασης με ΑΔΑ/ })).toBeInTheDocument();
        expect(screen.getByText(/Δεν άλλαξε τίποτα/)).toBeInTheDocument();
        expect(screen.getByText(/είναι ήδη συνδεδεμένη με το θέμα 30/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Δοκιμή ξανά/ })).toBeInTheDocument();
    });
});
