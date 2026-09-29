import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { AdaLookupStep } from '../AdaLookupStep';
import { diavgeiaViewUrl } from '../pdfUrl';
import messages from '../../../../../messages/el/admin.json';

const base = {
    subjectLabel: 'το θέμα 30', noCandidates: false, state: { kind: 'idle' as const },
    onSearch: jest.fn(), onOpenFound: jest.fn(), onManual: jest.fn(), onBack: jest.fn(), onClose: jest.fn(),
};
const renderStep = (overrides = {}) => render(
    <NextIntlClientProvider locale="el" messages={{ admin: messages }}>
        <AdaLookupStep {...base} {...overrides} />
    </NextIntlClientProvider>,
);

describe('AdaLookupStep', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sends the normalized ΑΔΑ', async () => {
        const onSearch = jest.fn();
        renderStep({ onSearch });
        await userEvent.type(screen.getByLabelText('ΑΔΑ'), '9ωPTΩΞ1-0YΣ');
        await userEvent.click(screen.getByRole('button', { name: 'Αναζήτηση στη Διαύγεια' }));
        expect(onSearch).toHaveBeenCalledWith('9ΩΡΤΩΞ1-0ΥΣ');
    });

    it('says a found document is not a decision, links it on Diavgeia and keeps the field editable', () => {
        renderStep({ state: { kind: 'notADecision', ada: '9ΩΡΤΩΞ1-0ΥΣ' } });
        expect(screen.getByText(/Το έγγραφο με ΑΔΑ 9ΩΡΤΩΞ1-0ΥΣ υπάρχει στη Διαύγεια, αλλά δεν είναι απόφαση συλλογικού οργάνου/)).toBeInTheDocument();
        const link = screen.getByRole('link', { name: 'Προβολή στη Διαύγεια' });
        expect(link).toHaveAttribute('href', diavgeiaViewUrl('9ΩΡΤΩΞ1-0ΥΣ'));
        expect(link).toHaveAttribute('target', '_blank');
        expect(screen.getByLabelText('ΑΔΑ')).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Αναζήτηση στη Διαύγεια' })).toBeEnabled();
    });

    it('closes the panel, even while a search runs', async () => {
        const onClose = jest.fn();
        renderStep({ onClose, state: { kind: 'searching', ada: '9ΩΡΤΩΞ1-0ΥΣ', taskId: 't1' } });
        const close = screen.getByRole('button', { name: 'Κλείσιμο' });
        expect(close).toBeEnabled();
        await userEvent.click(close);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('stops a malformed value before any request', async () => {
        const onSearch = jest.fn();
        renderStep({ onSearch });
        await userEvent.type(screen.getByLabelText('ΑΔΑ'), 'hello');
        await userEvent.click(screen.getByRole('button', { name: 'Αναζήτηση στη Διαύγεια' }));
        expect(onSearch).not.toHaveBeenCalled();
        expect(screen.getByText(/Αυτό δεν μοιάζει με ΑΔΑ/)).toBeInTheDocument();
    });

    it('says there is nothing to pick when it opens first, and hides the way back', () => {
        renderStep({ noCandidates: true, onBack: null });
        expect(screen.getByText('Δεν υπάρχει απόφαση της Διαύγειας για αυτή τη συνεδρίαση χωρίς θέμα.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Πίσω στη λίστα' })).not.toBeInTheDocument();
    });

    it('disables the search while another poll runs', () => {
        renderStep({ state: { kind: 'blocked' } });
        expect(screen.getByRole('button', { name: 'Αναζήτηση στη Διαύγεια' })).toBeDisabled();
    });

    it('keeps the ΑΔΑ and offers the manual route when nothing was found', async () => {
        const onManual = jest.fn();
        renderStep({ state: { kind: 'notFound', ada: '9ΩΡΤΩΞ1-0ΥΣ' }, onManual });
        expect(screen.getByLabelText('ΑΔΑ')).toHaveValue('9ΩΡΤΩΞ1-0ΥΣ');
        await userEvent.click(screen.getByRole('button', { name: 'Χειροκίνητη προσθήκη' }));
        expect(onManual).toHaveBeenCalled();
    });

    it('adds the cause after the search-failed sentence', () => {
        renderStep({ state: { kind: 'failed', ada: '9ΩΡΤΩΞ1-0ΥΣ', cause: 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.' } });
        expect(screen.getByText(
            'Η αναζήτηση για τον ΑΔΑ 9ΩΡΤΩΞ1-0ΥΣ δεν ολοκληρώθηκε. Δοκιμάστε ξανά. Δεν έχετε δικαίωμα για αυτή την ενέργεια.',
        )).toBeInTheDocument();
    });

    it('opens a found document', async () => {
        const onOpenFound = jest.fn();
        renderStep({ state: { kind: 'found', ada: 'Α-1', candidateId: 'c9', number: '66/2026', organizationLabel: null }, onOpenFound });
        await userEvent.click(screen.getByRole('button', { name: 'Άνοιγμα' }));
        expect(onOpenFound).toHaveBeenCalledWith('c9');
    });
});
