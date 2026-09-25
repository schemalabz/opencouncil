import { render, screen, fireEvent } from '@testing-library/react';
import { MinutesPreviewDialog } from '../MinutesPreviewDialog';
import type { MinutesData } from '@/lib/minutes/types';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => (key === 'adminOnly' ? 'Μόνο για διαχειριστές' : key),
    useLocale: () => 'el',
}));
jest.mock('@/components/meetings/CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({ meeting: { name: 'Δημοτικό Συμβούλιο 26/08/26' } }),
}));
jest.mock('@/components/meetings/admin/MinutesPreviewContent', () => ({
    MinutesPreviewContent: ({ debugMode }: { debugMode: boolean }) => <div data-testid="content">debug {String(debugMode)}</div>,
}));

const data = { attendanceChangesSource: 'events' } as unknown as MinutesData;
const renderDialog = (isSuperAdmin: boolean) => render(
    <MinutesPreviewDialog open onOpenChange={() => {}} data={data} isSuperAdmin={isSuperAdmin} />,
);

describe('MinutesPreviewDialog', () => {
    it('shows a city admin the minutes and no debug control', () => {
        renderDialog(false);
        expect(screen.getByTestId('content')).toHaveTextContent('debug false');
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryByText('Μόνο για διαχειριστές')).not.toBeInTheDocument();
    });

    it('gives a superadmin the debug control inside the admin frame', () => {
        renderDialog(true);
        const frame = screen.getByText('Μόνο για διαχειριστές').parentElement!;
        const toggle = screen.getByLabelText('debugClassification');
        expect(frame).toContainElement(toggle);
        fireEvent.click(toggle);
        expect(screen.getByTestId('content')).toHaveTextContent('debug true');
    });

    it('prints no provenance footer, for anyone', () => {
        renderDialog(true);
        expect(screen.queryByText(/changesFrom/)).not.toBeInTheDocument();
        expect(screen.queryByText(/issues\.count/)).not.toBeInTheDocument();
    });
});
