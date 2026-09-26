import { render } from '@testing-library/react';
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
});
