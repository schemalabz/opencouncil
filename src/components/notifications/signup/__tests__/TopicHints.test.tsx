import { fireEvent, render, screen } from '@testing-library/react';
import type { Topic } from '@prisma/client';
import { TopicHints } from '../TopicHints';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, string | number>) =>
        values ? `${key} ${Object.values(values).join(' ')}` : key,
    useLocale: () => 'el',
}));

const topic = (id: string, name: string): Topic => ({
    id,
    name,
    name_en: name,
    colorHex: '#4f46e5',
    icon: null,
    description: '',
    deprecated: false,
    realm: 'greece',
    createdAt: new Date(0),
    updatedAt: new Date(0),
});

const topics = [topic('env', 'Περιβάλλον'), topic('plan', 'Πολεοδομία'), topic('transport', 'Συγκοινωνίες')];

describe('TopicHints', () => {
    it('starts shut, as a hint, with no select-all anywhere', () => {
        render(<TopicHints topics={topics} selected={[]} onChange={jest.fn()} />);

        expect(screen.getByRole('button', { name: /topics\.title/ })).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByText('topics.hint')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Περιβάλλον/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /topics\.title/ }));
        expect(screen.queryByText(/selectAll|Επιλογή όλων/)).not.toBeInTheDocument();
    });

    it('names the chosen topics while shut', () => {
        render(<TopicHints topics={topics} selected={[topics[0], topics[2]]} onChange={jest.fn()} />);

        expect(screen.getByText('Περιβάλλον, Συγκοινωνίες')).toBeInTheDocument();
        expect(screen.getByText('topics.change')).toBeInTheDocument();
    });

    it('toggles a chip and reports the new choice', () => {
        const onChange = jest.fn();
        render(<TopicHints topics={topics} selected={[topics[0]]} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: /topics\.title/ }));

        expect(screen.getByRole('button', { name: 'Περιβάλλον' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', { name: 'Πολεοδομία' }));
        expect(onChange).toHaveBeenLastCalledWith([topics[0], topics[1]]);
        fireEvent.click(screen.getByRole('button', { name: 'Περιβάλλον' }));
        expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it('offers to clear only when something is chosen', () => {
        const onChange = jest.fn();
        const { rerender } = render(<TopicHints topics={topics} selected={[]} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: /topics\.title/ }));
        expect(screen.queryByRole('button', { name: 'topics.clear' })).not.toBeInTheDocument();

        rerender(<TopicHints topics={topics} selected={[topics[1]]} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'topics.clear' }));
        expect(onChange).toHaveBeenLastCalledWith([]);
    });
});
