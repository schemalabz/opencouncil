import { logSafePath } from '../logSafePath';

describe('logSafePath', () => {
    it('drops the query string, which can hold a token, a search or an address', () => {
        expect(logSafePath('/el/unsubscribe?token=abc123')).toBe('/el/unsubscribe');
        expect(logSafePath('/api/geocode?q=Οδός Καναρινιού 77')).toBe('/api/geocode');
    });

    it('redacts the credentials that travel in the path', () => {
        expect(logSafePath('/api/join/claim-token-123?confirmed=sig')).toBe('/api/join/[redacted]');
        expect(logSafePath('/mcp/mcp_secretkey123')).toBe('/mcp/mcp_[redacted]');
    });

    it('keeps any other path as it is', () => {
        expect(logSafePath('/el/athens/meetings/oct15_2026')).toBe('/el/athens/meetings/oct15_2026');
    });
});
