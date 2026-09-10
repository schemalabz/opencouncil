/** @jest-environment node */
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'https://opencouncil.gr' } }));

const mockGetRealm = jest.fn();
jest.mock('@/lib/realm.server', () => ({ getRealm: () => mockGetRealm() }));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn().mockResolvedValue(null) }));
jest.mock('@/lib/db/mcpTokens', () => ({ listUserMcpTokens: jest.fn().mockResolvedValue([]) }));
jest.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
jest.mock('@/i18n/routing', () => ({ Link: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/components/mcp/CopyButton', () => ({ CopyButton: ({ value }: { value: string }) => value }));
jest.mock('@/components/mcp/ConnectPanel', () => ({ ConnectPanel: ({ serverUrl }: { serverUrl: string }) => serverUrl }));
jest.mock('@/components/mcp/McpTokenManager', () => ({ McpTokenManager: () => null }));

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import McpPage from '../page';

async function renderFor(realm: string) {
    mockGetRealm.mockResolvedValue(realm);
    const tree = await McpPage({ params: Promise.resolve({ locale: 'el' }) });
    return renderToStaticMarkup(tree);
}

describe('/mcp address', () => {
    it("shows the MCP address on the visitor's own realm domain", async () => {
        expect(await renderFor('cyprus')).toContain('https://opencouncil.cy/mcp');
    });

    it('shows the Greek address to a Greek visitor', async () => {
        expect(await renderFor('greece')).toContain('https://opencouncil.gr/mcp');
    });

    it('does not offer another realm the Greek address', async () => {
        expect(await renderFor('france')).not.toContain('https://opencouncil.gr/mcp');
    });
});
