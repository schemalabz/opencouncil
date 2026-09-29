import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ConfirmSheet } from '../ConfirmSheet';
import admin from '../../../../../messages/el/admin.json';
import el from '../../../../../messages/el.json';

jest.mock('@/components/FormattedTextDisplay', () => ({
    FormattedTextDisplay: ({ text }: { text: string }) => <div data-testid="formatted">{text}</div>,
}));

type Props = React.ComponentProps<typeof ConfirmSheet>;

const renderSheet = (over: Partial<Props>) => render(
    <NextIntlClientProvider locale="el" messages={{ admin, ...el }}>
        <ConfirmSheet
            open
            onOpenChange={jest.fn()}
            action="view"
            decisionTitle="Παροχή εντολής"
            decisionNumber="637/2026"
            subjectName="το θέμα 2"
            pdfUrl="https://diavgeia.gov.gr/doc/ΨΞΚ1ΩΗΔ-Α1Β"
            ada="ΨΞΚ1ΩΗΔ-Α1Β"
            busy={false}
            onConfirm={jest.fn()}
            {...over}
        />
    </NextIntlClientProvider>,
);

describe('ConfirmSheet', () => {
    it('renders the subject summary through the markdown renderer', () => {
        renderSheet({ subjectDescription: '**x** [a](REF:UTTERANCE:u1)' });
        expect(screen.getByTestId('formatted')).toHaveTextContent('**x** [a](REF:UTTERANCE:u1)');
    });

    it('offers match and dismiss in assign mode', async () => {
        const onConfirm = jest.fn();
        const onDismiss = jest.fn();
        renderSheet({ action: 'assign', confirmLabel: 'Αντιστοίχιση', onConfirm, onDismiss });
        await userEvent.click(screen.getByRole('button', { name: 'Αντιστοίχιση' }));
        await userEvent.click(screen.getByRole('button', { name: 'Απόρριψη' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('offers no dismiss in view mode', () => {
        renderSheet({ onDismiss: jest.fn() });
        expect(screen.queryByRole('button', { name: 'Απόρριψη' })).not.toBeInTheDocument();
    });

    it('says the document is not on Diavgeia when it has no ΑΔΑ', () => {
        renderSheet({ ada: null, sourceNote: 'Δεν είναι στη Διαύγεια' });
        expect(screen.getByText('Δεν είναι στη Διαύγεια')).toBeInTheDocument();
        expect(screen.queryByText('Προβολή στη Διαύγεια')).not.toBeInTheDocument();
    });
});
