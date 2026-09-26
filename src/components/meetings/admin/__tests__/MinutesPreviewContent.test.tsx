import { render, screen } from '@testing-library/react';
import { MinutesPreviewContent } from '../MinutesPreviewContent';
import { committeeWithSubstitute, councilWithAbsentPresident } from '@/lib/minutes/__tests__/rollCallFixtures';

/** The on-screen minutes draw the same roll call as the DOCX; pinned markup for both body types. */
describe('MinutesPreviewContent roll call', () => {
    it('draws a committee the mayor presides, with a substitute sitting in', () => {
        const { container } = render(<MinutesPreviewContent data={committeeWithSubstitute()} />);
        expect(container.innerHTML).toMatchSnapshot();
    });

    it('draws a council with the mayor apart and the president absent', () => {
        const { container } = render(<MinutesPreviewContent data={councilWithAbsentPresident()} />);
        expect(container.innerHTML).toMatchSnapshot();
    });

    it('draws the lines the DOCX prints when the president was absent and someone else presided', () => {
        const data = councilWithAbsentPresident();
        data.councilComposition!.presidedBy = { name: 'Παπαγιαννάκη Νίκη', personId: 'p3' };
        render(<MinutesPreviewContent data={data} />);
        expect(screen.getByText('ΠΡΟΕΔΡΟΣ:').parentElement!.textContent)
            .toBe('ΠΡΟΕΔΡΟΣ: Παπαγιαννάκη Νίκη (λόγω απουσίας της ΠΡΟΕΔΡΟΥ Καραγιάννη Τάνια)');
        expect(screen.getByText(/απουσίαζαν οι/).textContent)
            .toBe('Κατά την έναρξη της συνεδρίασης απουσίαζαν οι Καραγιάννη Τάνια (ΠΡΟΕΔΡΟΣ), Λαμπρόπουλος Παναγιώτης (2)');
    });
});
