/** @jest-environment node */
import { mcpRewriteTarget } from '../rewrite';

const JSON_CT = 'application/json';

describe('mcpRewriteTarget', () => {
    it('rewrites MCP protocol requests on /mcp', () => {
        expect(mcpRewriteTarget('/mcp', 'POST', 'application/json, text/event-stream', JSON_CT)).toBe('/api/mcp');
        expect(mcpRewriteTarget('/mcp', 'POST', null, JSON_CT)).toBe('/api/mcp');
        expect(mcpRewriteTarget('/mcp', 'DELETE', null, null)).toBe('/api/mcp');
        expect(mcpRewriteTarget('/mcp', 'GET', 'text/event-stream', null)).toBe('/api/mcp');
    });

    it('lets browser GETs fall through to the instructions page', () => {
        expect(mcpRewriteTarget('/mcp', 'GET', 'text/html,application/xhtml+xml', null)).toBeNull();
        expect(mcpRewriteTarget('/mcp', 'GET', null, null)).toBeNull();
        expect(mcpRewriteTarget('/mcp', 'HEAD', null, null)).toBeNull();
    });

    it('lets the page\'s own server actions through (non-JSON POSTs)', () => {
        // Next.js server actions POST to the page URL with text/plain or
        // multipart bodies — they must render the page, not hit the protocol.
        expect(mcpRewriteTarget('/mcp', 'POST', 'text/x-component', 'text/plain;charset=UTF-8')).toBeNull();
        expect(
            mcpRewriteTarget('/mcp', 'POST', '*/*', 'multipart/form-data; boundary=----x')
        ).toBeNull();
        expect(mcpRewriteTarget('/mcp', 'POST', null, null)).toBeNull();
    });

    it('always rewrites tokened URLs, for any method and content type', () => {
        expect(mcpRewriteTarget('/mcp/mcp_abc-123', 'POST', null, JSON_CT)).toBe('/api/mcp/mcp_abc-123');
        expect(mcpRewriteTarget('/mcp/mcp_abc', 'GET', 'text/html', null)).toBe('/api/mcp/mcp_abc');
        expect(mcpRewriteTarget('/mcp/sk_service0', 'POST', null, null)).toBe('/api/mcp/sk_service0');
    });

    it('handles locale-prefixed URLs copied from the address bar', () => {
        expect(mcpRewriteTarget('/en/mcp', 'POST', null, JSON_CT)).toBe('/api/mcp');
        expect(mcpRewriteTarget('/el/mcp/mcp_abc', 'POST', null, JSON_CT)).toBe('/api/mcp/mcp_abc');
        expect(mcpRewriteTarget('/lat/mcp', 'GET', 'text/event-stream', null)).toBe('/api/mcp');
        // browser GET on a locale-prefixed page still renders the page
        expect(mcpRewriteTarget('/en/mcp', 'GET', 'text/html', null)).toBeNull();
        // not a locale prefix
        expect(mcpRewriteTarget('/athens/mcp', 'POST', null, JSON_CT)).toBeNull();
    });

    it('ignores non-mcp paths and malformed tokens', () => {
        expect(mcpRewriteTarget('/mcpx', 'POST', null, JSON_CT)).toBeNull();
        expect(mcpRewriteTarget('/mcp/', 'POST', null, JSON_CT)).toBeNull();
        expect(mcpRewriteTarget('/mcp/notatoken', 'POST', null, JSON_CT)).toBeNull();
        expect(mcpRewriteTarget('/mcp/mcp_abc/extra', 'POST', null, JSON_CT)).toBeNull();
        expect(mcpRewriteTarget('/mcp/mcp_"quote', 'POST', null, JSON_CT)).toBeNull();
        expect(mcpRewriteTarget('/athens', 'POST', null, JSON_CT)).toBeNull();
    });
});
