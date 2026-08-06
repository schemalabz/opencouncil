/** @jest-environment node */

const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        userMcpToken: {
            create: (...args: unknown[]) => mockCreate(...args),
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
        },
    },
}));

import { createHash } from 'crypto';
import { createUserMcpToken, validateUserMcpToken } from '../mcpTokens';

beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 't1', ...data }));
    mockUpdate.mockResolvedValue({});
});

describe('createUserMcpToken', () => {
    it('returns the raw token once and stores only its hash', async () => {
        const token = await createUserMcpToken('u1', 'Claude');

        expect(token.rawToken).toMatch(/^mcp_[A-Za-z0-9_-]+$/);
        const storedData = mockCreate.mock.calls[0][0].data;
        expect(storedData.hashedKey).toBe(createHash('sha256').update(token.rawToken).digest('hex'));
        expect(storedData.keyPrefix).toBe(token.rawToken.substring(0, 10));
        expect(storedData.userId).toBe('u1');
        expect(JSON.stringify(storedData)).not.toContain(token.rawToken);
    });
});

describe('validateUserMcpToken', () => {
    it('resolves the owning user for a valid token', async () => {
        const token = await createUserMcpToken('u1', 'Claude');
        mockFindUnique.mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: null });

        const result = await validateUserMcpToken(token.rawToken);
        expect(result).toEqual({ userId: 'u1', tokenId: 't1' });
        expect(mockFindUnique.mock.calls[0][0].where.hashedKey).toBe(
            createHash('sha256').update(token.rawToken).digest('hex')
        );
    });

    it('rejects unknown and revoked tokens', async () => {
        mockFindUnique.mockResolvedValue(null);
        expect(await validateUserMcpToken('mcp_unknown')).toBeNull();

        mockFindUnique.mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: new Date() });
        expect(await validateUserMcpToken('mcp_revoked')).toBeNull();
    });
});
