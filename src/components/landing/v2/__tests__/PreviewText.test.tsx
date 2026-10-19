import { render } from '@testing-library/react';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { PreviewText } from '../PreviewText';

describe('PreviewText', () => {
    it('shows the text as it is when nothing is loading', () => {
        const { container } = render(<p><PreviewText text="Η αρχή…" loading={false} /></p>);
        expect(container.textContent).toBe('Η αρχή…');
    });

    it('turns the closing "…" into three pulsing dots and names the wait for screen readers', () => {
        const { container } = render(<p><PreviewText text="Η αρχή…" loading /></p>);
        const dots = container.querySelectorAll('[aria-hidden] > span');
        expect(dots).toHaveLength(3);
        dots.forEach((dot) => expect(dot).toHaveClass('motion-safe:animate-pulse'));
        expect(container.querySelector('[aria-hidden]')?.textContent).toBe('...');
        expect(container.querySelector('.sr-only')?.textContent).toBe(' subject.loadingDescription');
        expect(container.textContent).toBe('Η αρχή... subject.loadingDescription');
    });
});
