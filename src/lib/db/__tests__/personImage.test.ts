import { mayChangePersonImage, withPersonImageKept } from '../personImage';
import { ConflictError, ForbiddenError } from '@/lib/api/errors';
import { vmsg } from '@/lib/zod-schemas/messages';

const mockPersonFindUnique = jest.fn();
const mockBodyFindMany = jest.fn();
const mockGetCurrentUser = jest.fn();
jest.mock('server-only', () => ({}));
jest.mock('../prisma', () => ({
    __esModule: true,
    default: {
        person: { findUnique: (...args: unknown[]) => mockPersonFindUnique(...args) },
        administrativeBody: { findMany: (...args: unknown[]) => mockBodyFindMany(...args) },
    },
}));
jest.mock('@/lib/auth', () => ({ getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args) }));

const youthOnly = [{ administrativeBody: { type: 'youthCouncil' as const } }];
const councillor = [{ administrativeBody: { type: 'council' as const } }];
const claimedAt = new Date('2026-09-16T10:00:00Z');
const owner = { administers: [{ personId: 'p1', claimedAt }] };
const delegate = { administers: [{ personId: 'p1', claimedAt: null }] };
const cityAdmin = { administers: [{ personId: null, claimedAt: null }] };

describe('mayChangePersonImage', () => {
    it('lets whoever edits a person of the municipality\'s own roster set the photo', () => {
        expect(mayChangePersonImage(cityAdmin, councillor, 'p1')).toBe(true);
        expect(mayChangePersonImage(null, [], null)).toBe(true);
    });

    it('lets only the account that claimed the page set the photo of a youth council member (#829)', () => {
        expect(mayChangePersonImage(owner, youthOnly, 'p1')).toBe(true);
        expect(mayChangePersonImage(delegate, youthOnly, 'p1')).toBe(false);
        expect(mayChangePersonImage(cityAdmin, youthOnly, 'p1')).toBe(false);
        expect(mayChangePersonImage(owner, youthOnly, 'p2')).toBe(false);
        expect(mayChangePersonImage(null, youthOnly, 'p1')).toBe(false);
    });

    it('lets nobody add the photo of such a member who has no page yet', () => {
        expect(mayChangePersonImage(owner, youthOnly, null)).toBe(false);
    });
});

describe('withPersonImageKept, the rule on an edit of a stored person', () => {
    const youthRole = { administrativeBodyId: 'youth' };
    const partyRole = { administrativeBodyId: null };
    const stored = (image: string | null, roles: { administrativeBody: { type: 'youthCouncil' | 'council' } | null }[]) =>
        mockPersonFindUnique.mockResolvedValue({ image, roles });

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCurrentUser.mockResolvedValue(cityAdmin);
        mockBodyFindMany.mockResolvedValue([{ id: 'youth', type: 'youthCouncil' }]);
    });

    it('refuses a role change that makes a person who keeps a photo youth-only with a 409 that names the remedy (#829)', async () => {
        // The photo was set while the person also had a party role. The
        // refusal is a conflict with the stored photo, not missing rights:
        // the form shows the text of a 409, and not the text of a 403.
        stored('https://cdn/photo.jpg', [{ administrativeBody: { type: 'youthCouncil' } }, { administrativeBody: null }]);
        await expect(withPersonImageKept('p1', { roles: [youthRole] })).rejects.toThrow(new ConflictError(vmsg('youthOnlyPersonPhoto')));
    });

    it('lets the same change pass when the photo goes with it, or when there is none', async () => {
        stored('https://cdn/photo.jpg', [{ administrativeBody: { type: 'youthCouncil' } }, { administrativeBody: null }]);
        await expect(withPersonImageKept('p1', { roles: [youthRole], image: null })).resolves.toBeUndefined();
        stored(null, [{ administrativeBody: { type: 'youthCouncil' } }, { administrativeBody: null }]);
        await expect(withPersonImageKept('p1', { roles: [youthRole] })).resolves.toBeUndefined();
    });

    it('lets an admin edit the roles of a youth-only member whose photo is their own', async () => {
        stored('https://cdn/own-photo.jpg', [{ administrativeBody: { type: 'youthCouncil' } }]);
        await expect(withPersonImageKept('p1', { roles: [youthRole] })).resolves.toBeUndefined();
    });

    it('decides a new photo on the roles after the write', async () => {
        stored(null, [{ administrativeBody: { type: 'youthCouncil' } }]);
        await expect(withPersonImageKept('p1', { roles: [youthRole, partyRole], image: 'https://cdn/new.jpg' })).resolves.toBeUndefined();
        await expect(withPersonImageKept('p1', { image: 'https://cdn/new.jpg' })).rejects.toThrow(ForbiddenError);
    });
});
