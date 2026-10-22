/** @jest-environment node */
jest.mock('@/lib/db/mcpTokens', () => ({ validateUserMcpToken: jest.fn() }));

import { validateUserMcpToken } from '@/lib/db/mcpTokens';
import { verifyMcpToken } from '../auth';

const mockToken = validateUserMcpToken as jest.MockedFunction<typeof validateUserMcpToken>;
const req = new Request('http://localhost/api/mcp');

describe('verifyMcpToken', () => {
    beforeEach(() => jest.clearAllMocks());

    it('keeps a request without a token anonymous', async () => {
        expect(await verifyMcpToken(req, undefined)).toBeUndefined();
        expect(mockToken).not.toHaveBeenCalled();
    });

    it('resolves a personal token to its owner', async () => {
        mockToken.mockResolvedValue({ tokenId: 'tok1', userId: 'u1', machineName: null });

        const info = await verifyMcpToken(req, 'mcp_abc');

        expect(mockToken).toHaveBeenCalledWith('mcp_abc');
        expect(info?.extra?.identity).toEqual({ userId: 'u1' });
        expect(info).toMatchObject({ clientId: 'u1' });
    });

    it('resolves a machine token to its account, with the name for analytics', async () => {
        mockToken.mockResolvedValue({ tokenId: 'tok2', userId: 'bot-1', machineName: 'Paola' });

        const info = await verifyMcpToken(req, 'mcp_bot');

        expect(info?.extra?.identity).toEqual({ userId: 'bot-1', machineName: 'Paola' });
    });

    it('throws on a revoked or unknown token', async () => {
        mockToken.mockResolvedValue(null);
        await expect(verifyMcpToken(req, 'mcp_gone')).rejects.toThrow('Invalid or revoked MCP token');
    });

    it('throws on every other prefix without a lookup', async () => {
        // The service API key (sk_) is gone; an old key fails closed.
        await expect(verifyMcpToken(req, 'sk_old')).rejects.toThrow('Unrecognized token format');
        await expect(verifyMcpToken(req, 'Bearer mcp_x')).rejects.toThrow('Unrecognized token format');
        expect(mockToken).not.toHaveBeenCalled();
    });
});
