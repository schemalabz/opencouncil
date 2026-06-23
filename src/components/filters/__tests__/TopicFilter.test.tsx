import { render, screen, fireEvent } from '@testing-library/react';
import { TopicFilter } from '../TopicFilter';
import { Topic } from '@prisma/client';

// next-intl ships ESM that Jest doesn't transform, so mock the hook with the
// Greek (default) translations — keeps the existing Greek assertions meaningful.
const elMessages: Record<string, string> = {
    noTopics: 'Δεν βρέθηκαν διαθέσιμα θέματα',
    header: 'Θέματα ({selected}/{total})',
    selectAll: 'Επιλογή όλων',
    clearAll: 'Καθαρισμός όλων',
};

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string | number>) => {
        let message = elMessages[key] ?? key;
        if (values) {
            for (const [name, value] of Object.entries(values)) {
                message = message.replace(`{${name}}`, String(value));
            }
        }
        return message;
    },
}));

const renderWithIntl = (ui: React.ReactElement) => render(ui);

// Mock the Icon component — it uses next/dynamic which doesn't work in tests
jest.mock('@/components/icon', () => {
    return function MockIcon({ name }: { name: string }) {
        return <span data-testid={`icon-${name}`} />;
    };
});

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
            <div {...props}>{children}</div>
        ),
    },
}));

const makeTopic = (overrides: Partial<Topic> & { id: string; name: string }): Topic => ({
    colorHex: '#3b82f6',
    icon: 'hash',
    name_en: '',
    description: '',
    deprecated: false,
    realm: 'greece',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const topics: Topic[] = [
    makeTopic({ id: 'safety', name: 'Ασφάλεια', name_en: 'Safety', icon: 'shield' }),
    makeTopic({ id: 'education', name: 'Παιδεία', name_en: 'Education', icon: 'graduation-cap' }),
    makeTopic({ id: 'transport', name: 'Συγκοινωνίες', name_en: 'Transportation', icon: 'bus' }),
];

describe('TopicFilter', () => {
    const mockOnChange = jest.fn();

    beforeEach(() => {
        mockOnChange.mockClear();
    });

    it('renders all topics', () => {
        renderWithIntl(<TopicFilter topics={topics} selectedTopics={[]} onChange={mockOnChange} />);

        expect(screen.getByText('Ασφάλεια')).toBeInTheDocument();
        expect(screen.getByText('Παιδεία')).toBeInTheDocument();
        expect(screen.getByText('Συγκοινωνίες')).toBeInTheDocument();
    });

    it('shows counter with selection state', () => {
        renderWithIntl(<TopicFilter topics={topics} selectedTopics={[topics[0]]} onChange={mockOnChange} />);

        expect(screen.getByText('Θέματα (1/3)')).toBeInTheDocument();
    });

    it('calls onChange with added topic when clicking unselected', () => {
        renderWithIntl(<TopicFilter topics={topics} selectedTopics={[topics[0]]} onChange={mockOnChange} />);

        fireEvent.click(screen.getByText('Παιδεία'));
        expect(mockOnChange).toHaveBeenCalledWith([topics[0], topics[1]]);
    });

    it('calls onChange with removed topic when clicking selected', () => {
        renderWithIntl(<TopicFilter topics={topics} selectedTopics={[topics[0], topics[1]]} onChange={mockOnChange} />);

        fireEvent.click(screen.getByText('Ασφάλεια'));
        expect(mockOnChange).toHaveBeenCalledWith([topics[1]]);
    });

    it('select all selects every topic', () => {
        renderWithIntl(<TopicFilter topics={topics} selectedTopics={[]} onChange={mockOnChange} />);

        fireEvent.click(screen.getByText('Επιλογή όλων'));
        expect(mockOnChange).toHaveBeenCalledWith(topics);
    });

    it('clear all deselects every topic', () => {
        renderWithIntl(<TopicFilter topics={topics} selectedTopics={topics} onChange={mockOnChange} />);

        fireEvent.click(screen.getByText('Καθαρισμός όλων'));
        expect(mockOnChange).toHaveBeenCalledWith([]);
    });

    it('shows loading spinner', () => {
        renderWithIntl(<TopicFilter topics={[]} selectedTopics={[]} onChange={mockOnChange} isLoading />);

        expect(screen.queryByText('Θέματα')).not.toBeInTheDocument();
        // Loader2 renders an svg with the animate-spin class
        expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('shows error message', () => {
        renderWithIntl(<TopicFilter topics={[]} selectedTopics={[]} onChange={mockOnChange} error="Something broke" />);

        expect(screen.getByText('Something broke')).toBeInTheDocument();
    });

    it('shows empty state when no topics', () => {
        renderWithIntl(<TopicFilter topics={[]} selectedTopics={[]} onChange={mockOnChange} />);

        expect(screen.getByText('Δεν βρέθηκαν διαθέσιμα θέματα')).toBeInTheDocument();
    });

    it('renders english name when available', () => {
        renderWithIntl(<TopicFilter topics={topics} selectedTopics={[]} onChange={mockOnChange} />);

        expect(screen.getByText('Safety')).toBeInTheDocument();
        expect(screen.getByText('Education')).toBeInTheDocument();
    });

    it('uses correct icon from topic data', () => {
        renderWithIntl(<TopicFilter topics={topics} selectedTopics={[]} onChange={mockOnChange} />);

        expect(screen.getByTestId('icon-shield')).toBeInTheDocument();
        expect(screen.getByTestId('icon-graduation-cap')).toBeInTheDocument();
        expect(screen.getByTestId('icon-bus')).toBeInTheDocument();
    });

    it('applies 2-column grid class', () => {
        const { container } = renderWithIntl(
            <TopicFilter topics={topics} selectedTopics={[]} onChange={mockOnChange} columns={2} />
        );

        const grid = container.querySelector('.sm\\:grid-cols-2');
        expect(grid).toBeInTheDocument();
    });
});
