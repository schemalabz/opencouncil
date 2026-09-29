import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ManualDecisionForm } from '../ManualDecisionForm';
import messages from '../../../../../messages/el/admin.json';

// LinkOrDrop uploads through the network; here it is a plain URL field.
jest.mock('@/components/ui/link-or-drop', () => ({
    LinkOrDrop: ({ value, onChange, id }: { value: string; onChange: (e: { target: { value: string } }) => void; id?: string }) =>
        <input id={id} value={value} onChange={e => onChange({ target: { value: e.target.value } })} />,
}));

const base = { subjectLabel: 'το θέμα 30', uploadConfig: { cityId: 'c1', identifier: 'm1_s1', suffix: 'decision' },
    initial: null, onContinue: jest.fn(), onUseAda: jest.fn(), onBack: jest.fn(), onClose: jest.fn() };
const renderForm = (o = {}) => render(
    <NextIntlClientProvider locale="el" messages={{ admin: messages }}><ManualDecisionForm {...base} {...o} /></NextIntlClientProvider>);

describe('ManualDecisionForm', () => {
    beforeEach(() => jest.clearAllMocks());

    it('continues with the PDF and the number, and optional fields as null', async () => {
        const onContinue = jest.fn();
        renderForm({ onContinue });
        await userEvent.type(screen.getByLabelText('PDF απόφασης'), 'https://files.example/a.pdf');
        await userEvent.type(screen.getByLabelText('Αριθμός απόφασης'), '12/2025');
        await userEvent.click(screen.getByRole('button', { name: 'Συνέχεια' }));
        expect(onContinue).toHaveBeenCalledWith({ pdfUrl: 'https://files.example/a.pdf', decisionNumber: '12/2025', title: null, protocolNumber: null });
    });

    it('closes the panel', async () => {
        const onClose = jest.fn();
        renderForm({ onClose });
        await userEvent.click(screen.getByRole('button', { name: 'Κλείσιμο' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('requires the PDF and the number', async () => {
        const onContinue = jest.fn();
        renderForm({ onContinue });
        await userEvent.click(screen.getByRole('button', { name: 'Συνέχεια' }));
        expect(onContinue).not.toHaveBeenCalled();
        expect(screen.getByText('Ανεβάστε το PDF ή δώστε έναν σύνδεσμο http(s).')).toBeInTheDocument();
        expect(screen.getByText(/υποχρεωτικός/)).toBeInTheDocument();
    });

    it('sends a Diavgeia link to the ΑΔΑ route', async () => {
        const onUseAda = jest.fn();
        renderForm({ onUseAda });
        await userEvent.type(screen.getByLabelText('PDF απόφασης'), 'https://diavgeia.gov.gr/doc/9ΩΡΤΩΞ1-0ΥΣ');
        await userEvent.click(screen.getByRole('button', { name: 'Αναζήτηση με ΑΔΑ' }));
        expect(onUseAda).toHaveBeenCalledWith('9ΩΡΤΩΞ1-0ΥΣ');
    });

    it('refills the form from the entry it continued with', async () => {
        const onContinue = jest.fn();
        const initial = { pdfUrl: 'https://files.example/a.pdf', decisionNumber: '12/2025', title: 'Τίτλος', protocolNumber: null };
        renderForm({ onContinue, initial });
        await userEvent.click(screen.getByRole('button', { name: 'Συνέχεια' }));
        expect(onContinue).toHaveBeenCalledWith(initial);
    });
});
