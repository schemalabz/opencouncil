import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '../pagination';

describe('Pagination', () => {
    const mockOnPageChange = jest.fn();

    beforeEach(() => {
        mockOnPageChange.mockClear();
    });

    it('returns null when totalPages <= 1', () => {
        const { container } = render(
            <Pagination currentPage={1} totalPages={1} pageSize={12} onPageChange={mockOnPageChange} />
        );
        expect(container.firstChild).toBeNull();
    });

    it('disables Previous button on first page', () => {
        render(<Pagination currentPage={1} totalPages={5} pageSize={12} onPageChange={mockOnPageChange} />);
        expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    });

    it('disables Next button on last page', () => {
        render(<Pagination currentPage={5} totalPages={5} pageSize={12} onPageChange={mockOnPageChange} />);
        expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    });

    it('calls onPageChange with correct page on click', () => {
        render(<Pagination currentPage={2} totalPages={5} pageSize={12} onPageChange={mockOnPageChange} />);

        fireEvent.click(screen.getByRole('button', { name: '3' }));
        expect(mockOnPageChange).toHaveBeenCalledWith(3);
    });

    it('calls onPageChange with previous page on Previous click', () => {
        render(<Pagination currentPage={3} totalPages={5} pageSize={12} onPageChange={mockOnPageChange} />);

        fireEvent.click(screen.getByRole('button', { name: /previous/i }));
        expect(mockOnPageChange).toHaveBeenCalledWith(2);
    });

    it('calls onPageChange with next page on Next click', () => {
        render(<Pagination currentPage={3} totalPages={5} pageSize={12} onPageChange={mockOnPageChange} />);

        fireEvent.click(screen.getByRole('button', { name: /next/i }));
        expect(mockOnPageChange).toHaveBeenCalledWith(4);
    });

    it('renders buttons, not links, without getHref', () => {
        render(<Pagination currentPage={2} totalPages={5} pageSize={12} onPageChange={mockOnPageChange} />);
        expect(screen.queryAllByRole('link')).toHaveLength(0);
        expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    });
});

describe('Pagination with links', () => {
    const onPageChange = jest.fn();
    const getHref = (page: number) => `?page=${page}`;

    beforeEach(() => onPageChange.mockClear());

    it('renders each page as a link inside a labelled navigation', () => {
        render(<Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} getHref={getHref} labels={{ previous: 'Previous', next: 'Next', navigation: 'Pages' }} />);
        expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '3' })).toHaveAttribute('href', '?page=3');
        expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute('href', '?page=3');
    });

    it('marks the current page', () => {
        render(<Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} getHref={getHref} />);
        expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: '3' })).not.toHaveAttribute('aria-current');
    });

    it('handles a plain click itself and leaves a modified click to the browser', () => {
        render(<Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} getHref={getHref} />);
        const link = screen.getByRole('link', { name: '3' });

        const plain = fireEvent.click(link);
        expect(plain).toBe(false); // default prevented
        expect(onPageChange).toHaveBeenCalledWith(3);

        onPageChange.mockClear();
        const withCtrl = fireEvent.click(link, { ctrlKey: true });
        expect(withCtrl).toBe(true); // left to the browser
        expect(onPageChange).not.toHaveBeenCalled();

        const middle = fireEvent.click(link, { button: 1 });
        expect(middle).toBe(true);
        expect(onPageChange).not.toHaveBeenCalled();
    });

    it.each(['metaKey', 'shiftKey', 'altKey'])('leaves a click with %s to the browser', key => {
        render(<Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} getHref={getHref} />);
        expect(fireEvent.click(screen.getByRole('link', { name: '3' }), { [key]: true })).toBe(true);
        expect(onPageChange).not.toHaveBeenCalled();
    });

    it('keeps a disabled edge control as a button', () => {
        render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} getHref={getHref} />);
        expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    });
});
