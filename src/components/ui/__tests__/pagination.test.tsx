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
});
