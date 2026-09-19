import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QuestionsCard, type QuestionsCardProps } from '../QuestionsCard';
import admin from '../../../../../messages/el/admin.json';

// Annotated (not left to inference) so the empty arrays type as
// `QuestionsCardProps`'s real array types, not `never[]` — otherwise the
// `Partial<typeof props>` overrides below (e.g. `renderCard({ unplaced })`)
// could not accept the concrete arrays.
const props: QuestionsCardProps = {
    waiting: null as { proposed: number; plain: number } | null,
    onJumpToTable: jest.fn(),
    conflicts: [],
    unplaced: [],
    pickerCandidateId: null,
    renderPicker: () => null,
    receipts: [],
    estimate: { kind: 'underMinute' as const },
    total: 0,
    subjectCount: 36,
    loadFailed: false,
    onRetryLoad: jest.fn(),
    pollState: { kind: 'idle' as const, everyDays: 7, nextCheck: '24 Σεπτεμβρίου' },
    onPoll: jest.fn(),
    polling: false,
    onOpenDocument: jest.fn(),
    onOpenPicker: jest.fn(),
    onDismiss: jest.fn(),
    onKeepHolder: jest.fn(),
    onMoveToClaimant: jest.fn(),
    busyCandidateId: null,
};

const unplaced = [
    { candidateId: 'c1', number: '670/2026', title: 'Έγκριση απόφασης Δημάρχου', publishedOn: '24/07/2026' },
    { candidateId: 'c2', number: '672/2026', title: 'Ψήφισμα', publishedOn: '24/07/2026' },
    { candidateId: 'c3', number: '611/2026', title: 'Έγκριση πρακτικού', publishedOn: '02/07/2026' },
];

const renderCard = (over: Partial<typeof props> = {}) => render(
    <NextIntlClientProvider locale="el" messages={{ admin }}>
        <QuestionsCard {...props} {...over} />
    </NextIntlClientProvider>,
);

describe('QuestionsCard', () => {
    it('says all is well only when nothing at all is outstanding', () => {
        renderCard();
        expect(screen.getByText(/Όλα εντάξει/)).toBeInTheDocument();
        expect(screen.getByText(/36/)).toBeInTheDocument();
    });

    it('counts waiting subjects as work and sends the person to the table', async () => {
        const onJumpToTable = jest.fn();
        renderCard({ waiting: { proposed: 1, plain: 2 }, total: 3, onJumpToTable });
        expect(screen.queryByText(/Όλα εντάξει/)).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /Δείτε τα στον πίνακα/ }));
        expect(onJumpToTable).toHaveBeenCalled();
    });

    it('sets the work estimate opposite the title and the count, not trailing them', () => {
        renderCard({ waiting: { proposed: 1, plain: 2 }, total: 3 });
        expect(screen.getByText('Λιγότερο από ένα λεπτό')).toHaveClass('ml-auto');
    });

    it('separates the subjects that need a yes or no from the ones that need a number', () => {
        renderCard({ waiting: { proposed: 1, plain: 2 }, total: 3 });
        expect(screen.getByText(/Ναι ή Όχι/)).toBeInTheDocument();
        expect(screen.getByText(/αριθμός από το πρακτικό/)).toBeInTheDocument();
    });

    it('drops the clause for a kind that has none', () => {
        renderCard({ waiting: { proposed: 0, plain: 2 }, total: 2 });
        expect(screen.queryByText(/Ναι ή Όχι/)).not.toBeInTheDocument();
    });

    it('calls unmatched Diavgeia documents decisions, never documents', () => {
        renderCard({ unplaced, total: 3 });
        expect(screen.getByText(/αποφάσεις της Διαύγειας/)).toBeInTheDocument();
        expect(screen.queryByText(/έγγραφα της Διαύγειας/)).not.toBeInTheDocument();
    });

    it('opens the unmatched list on demand and offers two answers each, named by decision', async () => {
        renderCard({ unplaced, total: 3 });
        await userEvent.click(screen.getByRole('button', { name: /Εμφάνιση/ }));
        expect(screen.getAllByRole('button', { name: /^Σε ποιο θέμα ανήκει η απόφαση/ })).toHaveLength(3);
        expect(screen.getAllByRole('button', { name: /^Η απόφαση .* δεν αφορά τη συνεδρίαση/ })).toHaveLength(3);
        // Each row's controls are named after that row's own decision, not a
        // repeated generic label a screen reader can't tell apart.
        expect(screen.getByRole('button', { name: 'Σε ποιο θέμα ανήκει η απόφαση 670/2026;' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Η απόφαση 672/2026 δεν αφορά τη συνεδρίαση' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Άνοιγμα εγγράφου της απόφασης 611/2026' })).toBeInTheDocument();
    });

    it('builds an unmatched row the way the decision picker builds its own', async () => {
        renderCard({ unplaced: [unplaced[0]], total: 1 });
        await userEvent.click(screen.getByRole('button', { name: /Εμφάνιση/ }));

        // The date is the row's muted second line, not a column crammed onto
        // the title's own line, where it left the title nothing.
        const date = screen.getByText('Αναρτήθηκε 24/07/2026');
        expect(date.tagName).toBe('P');
        expect(date).toHaveClass('text-muted-foreground');
        expect(date).not.toContainElement(screen.getByText('Έγκριση απόφασης Δημάρχου'));

        // Both answers stack at the right, the second under the first, rather
        // than the second sitting under the title as a remark about it.
        const dismiss = screen.getByRole('button', { name: /δεν αφορά τη συνεδρίαση/ });
        const controls = dismiss.parentElement;
        expect(controls).toHaveClass('flex-col', 'items-end');
        expect(controls).toContainElement(screen.getByRole('button', { name: /^Σε ποιο θέμα ανήκει/ }));
    });

    it('answers a conflict by naming the outcome, not the subject twice', () => {
        renderCard({
            total: 1,
            conflicts: [{
                candidateId: 'c4', number: '664/2026', title: 'Παροχή πληρεξουσιότητας',
                holder: { id: 's24', label: 'το θέμα 24', hasAgendaNumber: true },
                claimant: { id: 's25', label: 'το θέμα 25', hasAgendaNumber: true },
            }],
        });
        expect(screen.getByRole('button', { name: /Μένει στο θέμα 24/ })).toBeInTheDocument();
    });

    it('falls back to a plain outcome word when a subject has no agenda number to interpolate', () => {
        // A numbered subject's label ("το θέμα 24") fits on a button; a
        // nameless subject's label ("το θέμα «...»") can be the whole
        // agenda item's title and blow the button out to the width of the
        // card, so this case gets a fixed short label instead.
        renderCard({
            total: 1,
            conflicts: [{
                candidateId: 'c4', number: '664/2026', title: 'Παροχή πληρεξουσιότητας',
                holder: { id: 's24', label: 'το θέμα «Ανάθεση υπηρεσιών καθαριότητας σε ιδιώτη»', hasAgendaNumber: false },
                claimant: { id: 's25', label: 'το θέμα 25', hasAgendaNumber: true },
            }],
        });
        expect(screen.getByRole('button', { name: 'Μένει όπως είναι' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Μεταφορά στο θέμα 25/ })).toBeInTheDocument();
    });

    it('falls back to a plain outcome word for a nameless claimant too', () => {
        renderCard({
            total: 1,
            conflicts: [{
                candidateId: 'c4', number: '664/2026', title: 'Παροχή πληρεξουσιότητας',
                holder: { id: 's24', label: 'το θέμα 24', hasAgendaNumber: true },
                claimant: { id: 's25', label: 'το θέμα «Ανάθεση υπηρεσιών καθαριότητας σε ιδιώτη»', hasAgendaNumber: false },
            }],
        });
        expect(screen.getByRole('button', { name: /Μένει στο θέμα 24/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Μεταφορά' })).toBeInTheDocument();
    });

    it('names the open-document control by its own decision, even when a conflict and an unplaced decision both offer one', async () => {
        renderCard({
            total: 2,
            conflicts: [{
                candidateId: 'c4', number: '664/2026', title: 'Παροχή πληρεξουσιότητας',
                holder: { id: 's24', label: 'το θέμα 24', hasAgendaNumber: true },
                claimant: null,
            }],
            unplaced: [unplaced[0]],
        });
        await userEvent.click(screen.getByRole('button', { name: /Εμφάνιση/ }));
        // Neither visible label names its own decision, so each control gets
        // its own accessible name — a screen reader can tell them apart.
        expect(screen.getByRole('button', { name: 'Άνοιγμα εγγράφου της απόφασης 664/2026' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Άνοιγμα εγγράφου της απόφασης 670/2026' })).toBeInTheDocument();
        expect(screen.getByText('Άνοιγμα εγγράφου')).toBeInTheDocument();
        // The unmatched row wears the picker's short label, which leaves its
        // title more room.
        expect(screen.getByText('Άνοιγμα')).toBeInTheDocument();
    });

    it('keeps a receipt with an undo for what was just answered, named by that receipt', async () => {
        const undo = jest.fn();
        renderCard({ receipts: [{ id: 'r1', text: 'Το θέμα 31 συνδέθηκε με την απόφαση 671/2026.', undo }] });
        expect(screen.getByText('Αναίρεση')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Αναίρεση: Το θέμα 31 συνδέθηκε με την απόφαση 671/2026.' }));
        expect(undo).toHaveBeenCalled();
    });

    it('gives each receipt undo its own accessible name when several receipts are listed', () => {
        renderCard({
            receipts: [
                { id: 'r1', text: 'Το θέμα 31 συνδέθηκε με την απόφαση 671/2026.', undo: jest.fn() },
                { id: 'r2', text: 'Το θέμα 32 συνδέθηκε με την απόφαση 672/2026.', undo: jest.fn() },
            ],
        });
        expect(screen.getByRole('button', { name: 'Αναίρεση: Το θέμα 31 συνδέθηκε με την απόφαση 671/2026.' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Αναίρεση: Το θέμα 32 συνδέθηκε με την απόφαση 672/2026.' })).toBeInTheDocument();
    });

    it('offers a Diavgeia check with the reason a person would want one', () => {
        renderCard();
        expect(screen.getByText(/Δημοσιεύσατε/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Έλεγχος στη Διαύγεια τώρα/ })).toBeInTheDocument();
    });

    it('says a check is running and takes the button away', () => {
        renderCard({ pollState: { kind: 'running' } });
        expect(screen.getByText(/Ελέγχουμε τη Διαύγεια/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Έλεγχος στη Διαύγεια τώρα/ })).not.toBeInTheDocument();
    });

    it('says all is well without pointing at a button while a check is already running', () => {
        // The footer drops its button for `running` (a second click must not
        // queue a second poll), so the "all good" hint can't send the reader
        // looking for one either.
        renderCard({ pollState: { kind: 'running' } });
        expect(screen.getByText(/Όλα εντάξει/)).toBeInTheDocument();
        expect(screen.queryByText(/κουμπί παρακάτω/)).not.toBeInTheDocument();
        expect(screen.getByText(/Ελέγχουμε ήδη τη Διαύγεια/)).toBeInTheDocument();
    });

    it('promises only the manual check once every subject has a decision', () => {
        // The cron drops a meeting with no undecided subject, so "you will see
        // it here" was a promise nothing kept.
        renderCard({ pollState: { kind: 'manualOnly', reason: 'allDecided' } });
        expect(screen.getByText(/ζητήστε έναν έλεγχο από το κουμπί παρακάτω/)).toBeInTheDocument();
        expect(screen.getByText(/δεν ελέγχουμε πια αυτόματα/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Έλεγχος στη Διαύγεια τώρα/ })).toBeInTheDocument();
    });

    it('takes no second click while the check it asked for is on its way', async () => {
        const onPoll = jest.fn();
        renderCard({ polling: true, onPoll });
        const button = screen.getByRole('button', { name: /Έλεγχος στη Διαύγεια τώρα/ });
        expect(button).toBeDisabled();
        await userEvent.click(button);
        expect(onPoll).not.toHaveBeenCalled();
    });

    it('never says all is well when the decisions failed to load', () => {
        renderCard({ loadFailed: true });
        expect(screen.queryByText(/Όλα εντάξει/)).not.toBeInTheDocument();
        expect(screen.getByText(/δεν φορτώθηκαν/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Δοκιμή ξανά/ })).toBeInTheDocument();
    });

    it('shows a receipt alongside outstanding unplaced decisions, without claiming all is well', () => {
        renderCard({
            receipts: [{ id: 'r1', text: 'Το θέμα 31 συνδέθηκε με την απόφαση 671/2026.', undo: jest.fn() }],
            unplaced,
            total: 3,
        });
        expect(screen.getByText('Το θέμα 31 συνδέθηκε με την απόφαση 671/2026.')).toBeInTheDocument();
        expect(screen.getByText(/αποφάσεις της Διαύγειας/)).toBeInTheDocument();
        expect(screen.queryByText(/Όλα εντάξει/)).not.toBeInTheDocument();
    });

    it('explains a city with no Diavgeia link and still points at the table', () => {
        renderCard({ pollState: { kind: 'blocked' } });
        expect(screen.getByText(/δεν έχει ακόμη σύνδεση με τη Διαύγεια/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Έλεγχος στη Διαύγεια τώρα/ })).not.toBeInTheDocument();
    });

    it('names no button and no Diavgeia in the all-good hint when the city has no Diavgeia link', () => {
        // Nothing outstanding + `blocked` used to stack the "all good" hint
        // ("ask for a check with the button below") directly above the amber
        // "Diavgeia is not configured" line: a button that was not there, for
        // a service this city does not have.
        renderCard({ pollState: { kind: 'blocked' } });
        expect(screen.getByText(/Όλα εντάξει/)).toBeInTheDocument();
        expect(screen.queryByText(/κουμπί παρακάτω/)).not.toBeInTheDocument();
    });
});
