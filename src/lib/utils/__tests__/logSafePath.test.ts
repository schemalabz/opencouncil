import { logSafePath } from '../logSafePath.cjs';

describe('logSafePath', () => {
    it('drops the query string, which can hold a token, a search or an address', () => {
        expect(logSafePath('/el/unsubscribe?token=abc123')).toBe('/el/unsubscribe');
        expect(logSafePath('/api/geocode?q=Οδός Καναρινιού 77')).toBe('/api/geocode');
    });

    it('redacts the credentials that travel in the path', () => {
        expect(logSafePath('/api/join/claim-token-123?confirmed=sig')).toBe('/api/join/[redacted]');
        // Real MCP keys are base64url, with `-` and `_`.
        expect(logSafePath('/mcp/mcp_Ab-9_xYz')).toBe('/mcp/mcp_[redacted]');
    });

    it('redacts an invite token behind repeated slashes or percent-escapes', () => {
        expect(logSafePath('//api/join/claim-token-123')).toBe('//api/join/[redacted]');
        expect(logSafePath('/api//join/claim-token-123')).toBe('/api/join/[redacted]');
        expect(logSafePath('/api/%6Aoin/claim-token-123')).toBe('/api/join/[redacted]');
    });

    it('keeps a decoded line break or control character escaped, so a path cannot forge a log line', () => {
        expect(logSafePath('/el/%0A[request] 0000 GET /fake 200 1ms')).toBe('/el/%0A[request] 0000 GET /fake 200 1ms');
        expect(logSafePath('/el/a%0D%0Ab%00c%E2%80%A8d')).toBe('/el/a%0D%0Ab%00c%E2%80%A8d');
    });

    it('keeps any other path as it is, and a malformed escape as it is', () => {
        expect(logSafePath('/el/athens/meetings/oct15_2026')).toBe('/el/athens/meetings/oct15_2026');
        expect(logSafePath('/el/%E0%A4%A')).toBe('/el/%E0%A4%A');
    });
});
