import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDeleteDialog } from '../confirm-delete-dialog';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function setup(onConfirm = jest.fn().mockResolvedValue(undefined)) {
    const onOpenChange = jest.fn();
    render(
        <ConfirmDeleteDialog
            open
            onOpenChange={onOpenChange}
            title="Delete Member"
            description="This cannot be undone."
            itemName="Γεώργιος Γρίβας"
            onConfirm={onConfirm}
        />,
    );
    return { onConfirm, onOpenChange };
}

describe('ConfirmDeleteDialog', () => {
    it('names the item that will be deleted', () => {
        setup();
        expect(screen.getByText('Γεώργιος Γρίβας')).toBeInTheDocument();
    });

    it('deletes only after the destructive button', async () => {
        const { onConfirm } = setup();
        expect(onConfirm).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete Member' }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });

    it('locks both buttons while the deletion runs, so it cannot start twice', async () => {
        let finish: () => void = () => {};
        const { onConfirm } = setup(jest.fn(() => new Promise<void>(resolve => { finish = resolve; })));
        fireEvent.click(screen.getByRole('button', { name: 'Delete Member' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Member' })).toBeDisabled());
        expect(screen.getByRole('button', { name: 'cancel' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Delete Member' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        finish();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Delete Member' })).toBeEnabled());
    });

    it('closes without deleting on cancel', () => {
        const { onConfirm, onOpenChange } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onConfirm).not.toHaveBeenCalled();
    });
});
