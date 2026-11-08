import { act, fireEvent, render, screen } from '@testing-library/react';
import { AIGeneratedBadge } from '../AIGeneratedBadge';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'el' }));
jest.mock('@/i18n/routing', () => ({ getPathname: ({ href }: { href: string }) => href }));

// Radix positions the popover with a ResizeObserver, which jsdom does not have.
class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
beforeAll(() => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
});

describe('AIGeneratedBadge', () => {
    it('opens the text-only disclosure with a link to the process', async () => {
        render(<AIGeneratedBadge />);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'aiGenerated' }));
        });
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent('aiDisclosure.title');
        expect(dialog).toHaveTextContent('aiDisclosure.bodyText');
        expect(dialog).not.toHaveTextContent('aiDisclosure.body ');
        expect(screen.getByRole('link', { name: 'aiDisclosure.learnMore' })).toHaveAttribute('href', '/about#process');
    });

    it('keeps the click inside the badge, so a card around it does not select itself', () => {
        const onCardClick = jest.fn();
        render(<div onClick={onCardClick}><AIGeneratedBadge /></div>);
        fireEvent.click(screen.getByRole('button', { name: 'aiGenerated' }));
        expect(onCardClick).not.toHaveBeenCalled();
    });
});
