/** @jest-environment node */

const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();
const mockCount = jest.fn();

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        userMcpToken: {
            create: (...args: unknown[]) => mockCreate(...args),
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
            count: (...args: unknown[]) => mockCount(...args),
        },
    },
}));

import { createHash } from 'crypto';
import { createUserMcpToken, validateUserMcpToken } from '../mcpTokens';
import { GENERATED_MCP_TOKEN_NAME } from '@/lib/mcp/tokenNames';

beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 't1', ...data }));
    mockUpdate.mockResolvedValue({});
    mockCount.mockResolvedValue(0);
});

describe('createUserMcpToken', () => {
    it('returns the raw token once and stores only its hash', async () => {
        const token = await createUserMcpToken('u1');

        expect(token.rawToken).toMatch(/^mcp_[A-Za-z0-9_-]+$/);
        const storedData = mockCreate.mock.calls[0][0].data;
        expect(storedData.hashedKey).toBe(createHash('sha256').update(token.rawToken).digest('hex'));
        expect(storedData.keyPrefix).toBe(token.rawToken.substring(0, 10));
        expect(storedData.userId).toBe('u1');
        expect(JSON.stringify(storedData)).not.toContain(token.rawToken);
    });

    it('stores the generated marker without reading the account first', async () => {
        // Any ordinal derived here would need a count, and two concurrent
        // creates would read the same one and store the same number. The UI
        // numbers the rows by age instead, where position is exact.
        const token = await createUserMcpToken('u1');

        expect(mockCount).not.toHaveBeenCalled();
        expect(token.name).toBe(GENERATED_MCP_TOKEN_NAME);
    });
});

describe('validateUserMcpToken', () => {
    it('resolves the owning user for a valid token', async () => {
        const token = await createUserMcpToken('u1');
        mockFindUnique.mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: null, user: { isMachine: false, name: 'Anna', email: 'anna@example.com' } });

        const result = await validateUserMcpToken(token.rawToken);
        expect(result).toEqual({ userId: 'u1', tokenId: 't1', machineName: null });
        expect(mockFindUnique.mock.calls[0][0].where.hashedKey).toBe(
            createHash('sha256').update(token.rawToken).digest('hex')
        );
    });

    it('names the owner when it is a machine account', async () => {
        mockFindUnique.mockResolvedValue({ id: 't2', userId: 'bot-1', revokedAt: null, user: { isMachine: true, name: 'Paola', email: 'paola@machines.opencouncil.invalid' } });
        expect(await validateUserMcpToken('mcp_bot')).toEqual({ userId: 'bot-1', tokenId: 't2', machineName: 'Paola' });

        mockFindUnique.mockResolvedValue({ id: 't3', userId: 'bot-2', revokedAt: null, user: { isMachine: true, name: null, email: 'athens-bot@machines.opencouncil.invalid' } });
        expect(await validateUserMcpToken('mcp_bot2')).toEqual({ userId: 'bot-2', tokenId: 't3', machineName: 'athens-bot@machines.opencouncil.invalid' });
    });

    it('rejects unknown and revoked tokens', async () => {
        mockFindUnique.mockResolvedValue(null);
        expect(await validateUserMcpToken('mcp_unknown')).toBeNull();

        mockFindUnique.mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: new Date() });
        expect(await validateUserMcpToken('mcp_revoked')).toBeNull();
    });
});
