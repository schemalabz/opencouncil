import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { AdaForm } from '@/components/meetings/decisions/AdaForm';
import messages from '../../../../../messages/el/admin.json';

const renderForm = (onSubmit = jest.fn()) => {
    render(
        <NextIntlClientProvider locale="el" messages={{ admin: messages }}>
            <AdaForm subjectLabel="το θέμα 30" hasAgendaNumber saving={false} onSubmit={onSubmit} onBack={jest.fn()} />
        </NextIntlClientProvider>,
    );
    return onSubmit;
};

describe('AdaForm', () => {
    it('refuses to submit without an ΑΔΑ, and says so', async () => {
        const onSubmit = renderForm();
        await userEvent.click(screen.getByRole('button', { name: /Σύνδεση/ }));
        expect(onSubmit).not.toHaveBeenCalled();
        expect(await screen.findByText(/υποχρεωτικός/)).toBeInTheDocument();
    });

    it('submits the ΑΔΑ alone, because the number is ours to find', async () => {
        const onSubmit = renderForm();
        await userEvent.type(screen.getByLabelText('ΑΔΑ'), 'ΨΞΚ1ΩΗΔ-Α1Β');
        await userEvent.click(screen.getByRole('button', { name: /Σύνδεση/ }));
        expect(onSubmit).toHaveBeenCalledWith({ ada: 'ΨΞΚ1ΩΗΔ-Α1Β', decisionNumber: null });
    });

    it('keeps the two inputs on one baseline instead of letting a label wrap under it', () => {
        // The qualifier used to live in the label — «Αριθμός απόφασης (αν τον
        // ξέρετε)» — where it wrapped onto a second line and pushed its input
        // a line below the ΑΔΑ field. Both cells now span the same rows of the
        // parent grid, so the label row is one height for both of them.
        renderForm();
        const cells = [screen.getByLabelText('ΑΔΑ'), screen.getByLabelText(/Αριθμός απόφασης/)]
            .map(input => input.parentElement);
        for (const cell of cells) {
            expect(cell).toHaveClass('sm:row-span-3', 'sm:grid-rows-subgrid');
        }
        expect(cells[0]?.parentElement).toBe(cells[1]?.parentElement);
        expect(screen.getByText('Προαιρετικός, αν τον ξέρετε')).toBeInTheDocument();
    });

    it('passes a number the person happens to know', async () => {
        const onSubmit = renderForm();
        await userEvent.type(screen.getByLabelText('ΑΔΑ'), 'ΨΞΚ1ΩΗΔ-Α1Β');
        await userEvent.type(screen.getByLabelText(/Αριθμός απόφασης/), '670/2026');
        await userEvent.click(screen.getByRole('button', { name: /Σύνδεση/ }));
        expect(onSubmit).toHaveBeenCalledWith({ ada: 'ΨΞΚ1ΩΗΔ-Α1Β', decisionNumber: '670/2026' });
    });
});
