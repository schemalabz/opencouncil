import { render, waitFor } from '@testing-library/react';
import PlausibleAnalytics from '../PlausibleAnalytics';

// The Plausible script is the only source of the public opencouncil.gr
// pageview dashboard. A change to its URL or attributes stops the counting
// silently, with no error anywhere, so this test pins what the browser loads.

let mockPathname = '/el';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

function plausibleScripts() {
    return Array.from(document.querySelectorAll('script')).filter(
        (script) => script.src.includes('plausible') || script.id.startsWith('next-plausible'),
    );
}

function setNodeEnv(value: 'development' | 'production') {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: value });
}

afterEach(() => {
    mockPathname = '/el';
    jest.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('PlausibleAnalytics', () => {
    // next/script loads each script src once per module instance and skips it
    // after that. The tests that expect no script therefore run first, before
    // any test loads it; otherwise they would pass whatever the component does.
    it('loads no script on embed routes', async () => {
        setNodeEnv('production');
        mockPathname = '/el/embed/meetings';
        const { getByText } = render(<PlausibleAnalytics><p>embed</p></PlausibleAnalytics>);

        expect(getByText('embed')).toBeInTheDocument();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(plausibleScripts()).toHaveLength(0);
    });

    it('loads no script outside production', async () => {
        setNodeEnv('development');
        const { getByText } = render(<PlausibleAnalytics><p>page</p></PlausibleAnalytics>);

        expect(getByText('page')).toBeInTheDocument();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(plausibleScripts()).toHaveLength(0);
    });

    it('loads the Plausible script for opencouncil.gr in production', async () => {
        setNodeEnv('production');
        render(<PlausibleAnalytics><p>page</p></PlausibleAnalytics>);

        await waitFor(() => expect(document.querySelector('script[src*="plausible.io"]')).not.toBeNull());
        const script = document.querySelector<HTMLScriptElement>('script[src*="plausible.io"]');
        expect(script?.getAttribute('src')).toBe('https://plausible.io/js/script.js');
        expect(script?.getAttribute('data-domain')).toBe('opencouncil.gr');
        expect(document.getElementById('next-plausible-init')?.textContent).toContain('window.plausible');
    });
});
