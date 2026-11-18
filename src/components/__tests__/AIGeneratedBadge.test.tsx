import { act, fireEvent, render, screen } from '@testing-library/react';
import { AIGeneratedBadge } from '../AIGeneratedBadge';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'el' }));
jest.mock('@/i18n/routing', () => ({ getPathname: ({ href }: { href: string }) => href }));
const mockRealm = jest.fn(() => 'greece');
jest.mock('@/hooks/useRealm', () => ({ useRealm: () => mockRealm() }));

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
    afterEach(() => mockRealm.mockReturnValue('greece'));

    const open = async () => {
        render(<AIGeneratedBadge />);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'aiGenerated' }));
        });
    };

    it('opens the text-only disclosure with a link to the AI section of /explain', async () => {
        await open();
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent('aiDisclosure.title');
        expect(dialog).toHaveTextContent('aiDisclosure.bodyText');
        expect(dialog).not.toHaveTextContent('aiDisclosure.body ');
        expect(screen.getByRole('link', { name: 'aiDisclosure.learnMore' })).toHaveAttribute('href', '/explain#oc-ai-what');
    });

    it('links to the about page in a realm without /explain', async () => {
        mockRealm.mockReturnValue('serbia');
        await open();
        expect(screen.getByRole('link', { name: 'aiDisclosure.learnMore' })).toHaveAttribute('href', '/about#process');
    });

    it('keeps the click inside the badge, so a card around it does not select itself', () => {
        const onCardClick = jest.fn();
        render(<div onClick={onCardClick}><AIGeneratedBadge /></div>);
        fireEvent.click(screen.getByRole('button', { name: 'aiGenerated' }));
        expect(onCardClick).not.toHaveBeenCalled();
    });
});
