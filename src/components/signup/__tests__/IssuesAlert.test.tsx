/** @jest-environment jsdom */
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { IssuesAlert } from '../IssuesAlert';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
}));
jest.mock('@/i18n/routing', () => ({
    Link: ({ href, children }: { href: string; children: React.ReactNode }) =>
        createElement('a', { href }, children),
}));

const props = { issues: [], email: 'new@example.com', signedIn: false, failures: 0 };

const wayIn = () => screen.queryByRole('link');

describe('IssuesAlert', () => {
    beforeAll(() => {
        window.matchMedia = jest.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    });

    it('offers the account that holds the number, without naming it', () => {
        render(<IssuesAlert {...props} saveError="phoneInUse" />);

        expect(screen.getByText(/errors.phoneInUse/)).toBeInTheDocument();
        const link = wayIn();
        expect(link).toHaveAttribute('href', expect.stringContaining('/sign-in?callbackUrl='));
        // The account that holds the number is not the email on the form, so
        // filling that address in would send the reader back to the same wall.
        expect(link?.getAttribute('href')).not.toContain('email=');
    });

    it('tells a signed-in reader to change the number instead', () => {
        render(<IssuesAlert {...props} signedIn saveError="phoneInUse" />);

        expect(screen.getByText(/errors.phoneInUseSignedIn/)).toBeInTheDocument();
        expect(wayIn()).toBeNull();
    });

    it('keeps the typed email on the sign-in link for an account that owns it', () => {
        render(<IssuesAlert {...props} saveError="emailExists" />);

        expect(wayIn()?.getAttribute('href')).toContain(`email=${encodeURIComponent('new@example.com')}`);
    });

    it('says nothing while nothing is wrong', () => {
        const { container } = render(<IssuesAlert {...props} saveError={null} />);

        expect(container).toBeEmptyDOMElement();
    });
});
