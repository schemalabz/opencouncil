import { render } from '@testing-library/react';

import { Badge } from '../badge';

describe('Badge', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('renders an inline element, so it is valid inside a paragraph', () => {
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });

        const { container } = render(
            <p>
                Text with a <Badge variant="outline">party</Badge> reference.
            </p>
        );

        const badge = container.querySelector('p > span');
        expect(badge).not.toBeNull();
        expect(badge).toHaveTextContent('party');
        expect(consoleError).not.toHaveBeenCalled();
    });

    it('renders the child element with asChild', () => {
        const { container } = render(
            <Badge asChild className="custom">
                <a href="/parties/1">party</a>
            </Badge>
        );

        const link = container.querySelector('a');
        expect(link).toHaveAttribute('href', '/parties/1');
        expect(link).toHaveClass('custom');
        expect(link).toHaveClass('rounded-full');
    });
});
