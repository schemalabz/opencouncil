import { render, screen } from '@testing-library/react';
import { FormattedTextDisplay } from '../FormattedTextDisplay';

let mockHref = '';
let mockLocale = 'en';
jest.mock('next-intl', () => ({ useLocale: () => mockLocale }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
jest.mock('../meetings/subject/UtteranceReferenceLink', () => ({ UtteranceReferenceLink: ({ children }: { children: React.ReactNode }) => <button>{children}</button> }));
// The markdown library owns parsing; these tests exercise OC's URL policy and
// source-reference renderer using the same component contract it invokes.
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ urlTransform, components }: { urlTransform: (href: string) => string; components: { a: (props: { href: string; children: string }) => React.ReactNode } }) => components.a({ href: urlTransform(mockHref), children: 'source' }),
}));

describe('standalone markdown source links', () => {
    beforeEach(() => { mockLocale = 'en'; mockHref = 'REF:UTTERANCE:source-id'; });
    it('renders validated source links without a meeting provider', () => {
        render(<FormattedTextDisplay text="source" disableUtteranceExpansion utteranceLinks={{ 'source-id': '/en/city/meeting/transcript?t=0#source-id' }} />);
        expect(screen.getByRole('link', { name: 'source' })).toHaveAttribute('href', '/en/city/meeting/transcript?t=0#source-id');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
    it('leaves invalid or hidden references as plain text', () => {
        render(<FormattedTextDisplay text="source" disableUtteranceExpansion utteranceLinks={{}} />);
        expect(screen.getByText('source')).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
    it('preserves existing provider-backed expansion when no map is supplied', () => {
        render(<FormattedTextDisplay text="source" />);
        expect(screen.getByRole('button', { name: 'source' })).toBeInTheDocument();
    });
    it.each(['javascript:alert(1)', 'data:text/html,<script>', '//external.test/path'])('makes unsupported URL %s inert', href => {
        mockHref = href;
        render(<FormattedTextDisplay text="source" />);
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });
    it('allows HTTPS links and preserves byte-exact IDs in Serbian Latin entity URLs', () => {
        mockHref = 'REF:PERSON:Љ-Id'; mockLocale = 'sr-Latn';
        const { rerender } = render(<FormattedTextDisplay text="source" cityId="city" />);
        expect(screen.getByRole('link')).toHaveAttribute('href', '/lat/city/people/Љ-Id');
        mockHref = 'https://example.test/report';
        rerender(<FormattedTextDisplay text="changed" cityId="city" />);
        expect(screen.getByRole('link')).toHaveAttribute('href', mockHref);
        expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
    });
});
