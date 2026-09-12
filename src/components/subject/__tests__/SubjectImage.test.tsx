import { fireEvent, render, screen } from '@testing-library/react';
import { SubjectImage } from '../SubjectImage';

jest.mock('@/components/icon', () => ({
    __esModule: true,
    default: ({ name }: { name: string }) => <span data-testid="icon" data-name={name} />,
}));

describe('SubjectImage', () => {
    it('draws the topic glyph under the image', () => {
        const { container } = render(<SubjectImage subjectId="s1" alt="" topic={{ colorHex: '#2a9d8f', icon: 'leaf' }} />);
        expect(screen.getByTestId('icon')).toHaveAttribute('data-name', 'leaf');
        expect(container.querySelector('img')).toHaveAttribute('src', '/api/subject/s1/image');
    });

    it('falls back to the hash glyph without a topic', () => {
        render(<SubjectImage subjectId="s1" alt="" topic={null} />);
        expect(screen.getByTestId('icon')).toHaveAttribute('data-name', 'hash');
    });

    it('hides the image on a 404 and shows it again for a new version', () => {
        const { container, rerender } = render(<SubjectImage subjectId="s1" alt="" />);
        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        fireEvent.error(img as HTMLImageElement);
        expect(container.querySelector('img')).toBeNull();

        rerender(<SubjectImage subjectId="s1" alt="" version={2} />);
        expect(container.querySelector('img')).toHaveAttribute('src', '/api/subject/s1/image?v=2');
    });
});
