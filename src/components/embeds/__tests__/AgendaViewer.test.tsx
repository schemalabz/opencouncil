import { render } from '@testing-library/react';
import { AgendaViewer } from '../AgendaViewer';

// The lightbox and the localized Link are not under test here.
jest.mock('../ZoomLightbox', () => ({ ZoomLightbox: () => null }));
jest.mock('@/i18n/routing', () => ({
    Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));

describe('AgendaViewer', () => {
    it('leaves the PDF to load as the reader approaches it', () => {
        const { container } = render(
            <AgendaViewer title="Ημερήσια Διάταξη" pdf="https://example.org/agenda.pdf" />,
        );

        expect(container.querySelector('iframe')).toHaveAttribute('loading', 'lazy');
    });
});
