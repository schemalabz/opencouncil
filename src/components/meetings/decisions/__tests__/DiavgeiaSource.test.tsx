import { render, screen } from '@testing-library/react';
import { DiavgeiaSourceLink } from '@/components/meetings/decisions/DiavgeiaSource';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string, params?: Record<string, unknown>) =>
        params ? `${key}${JSON.stringify(params)}` : key,
}));

describe('DiavgeiaSourceLink', () => {
    it('names the organization id on the line itself and links it', () => {
        // A named link reading "the municipality's decisions on Diavgeia" hid
        // the one thing a person checking a configuration came to read.
        render(<DiavgeiaSourceLink diavgeiaUid="50026" pollScope={[]} dated />);
        const link = screen.getByRole('link', { name: 'scope.org{"org":"50026"}' });
        expect(link).toHaveAttribute('href', expect.stringContaining('50026'));
        expect(screen.getByText('scope.orgWide')).toHaveClass('text-amber-700');
    });

    it('names the configured unit beside it, linked to that unit’s listing', () => {
        render(<DiavgeiaSourceLink
            diavgeiaUid="50026"
            pollScope={[{ entry: '84655', scope: { unit: '84655' }, error: null }]}
            dated
        />);
        expect(screen.getByRole('link', { name: 'scope.org{"org":"50026"}' })).toBeInTheDocument();
        const unit = screen.getByRole('link', { name: 'scope.unit{"unit":"84655"}' });
        expect(unit).toHaveAttribute('href', expect.stringContaining('unitUid'));
    });

    it('names every unit when several are configured, signer and all', () => {
        render(<DiavgeiaSourceLink diavgeiaUid="50026" pollScope={[
            { entry: '84655', scope: { unit: '84655' }, error: null },
            { entry: '90001:7', scope: { unit: '90001', signer: '7' }, error: null },
        ]} dated />);
        expect(screen.getByRole('link', { name: 'scope.unit{"unit":"84655"}' })).toBeInTheDocument();
        const signed = screen.getByRole('link', { name: 'scope.unitSigner{"unit":"90001","signer":"7"}' });
        expect(signed).toHaveAttribute('href', expect.stringContaining('signerUid'));
    });

    it('marks a malformed entry, which nothing else on this line would show', () => {
        render(<DiavgeiaSourceLink diavgeiaUid="50026" pollScope={[
            { entry: 'bad:1:2', scope: null, error: 'bad entry' },
        ]} dated />);
        const bad = screen.getByText('scope.malformed{"error":"bad:1:2"}');
        expect(bad).toHaveClass('text-amber-700');
        expect(bad).toHaveAttribute('title', 'bad entry');
        // The organization stays readable and linked beside the broken entry.
        expect(screen.getByRole('link', { name: 'scope.org{"org":"50026"}' })).toBeInTheDocument();
    });

    it('says so when the city has no Diavgeia organization, and links nothing', () => {
        render(<DiavgeiaSourceLink diavgeiaUid={null} pollScope={[]} dated />);
        expect(screen.getByText('scope.noOrg')).toHaveClass('text-amber-700');
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
    it('separates the first clause from a dated sentence with a comma', () => {
        const { container } = render(<DiavgeiaSourceLink
            diavgeiaUid="50026"
            pollScope={[{ entry: '84655', scope: { unit: '84655' }, error: null }]}
            dated
        />);
        expect(container.textContent).toBe(', scope.org{"org":"50026"}, scope.unit{"unit":"84655"}');
    });

    it('continues the never-checked sentence without one, which read as trailing metadata', () => {
        // «Δεν έχει ελεγχθεί ακόμη, στον οργανισμό 50026, στη μονάδα 84655» is
        // the state every unpolled meeting shows. The clause qualifies the verb
        // the sentence ends in, so it continues it directly.
        const { container } = render(<DiavgeiaSourceLink
            diavgeiaUid="50026"
            pollScope={[{ entry: '84655', scope: { unit: '84655' }, error: null }]}
            dated={false}
        />);
        expect(container.textContent).toBe(' scope.org{"org":"50026"}, scope.unit{"unit":"84655"}');
    });
});
