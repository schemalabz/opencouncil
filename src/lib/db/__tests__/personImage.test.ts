import { mayChangePersonImage } from '../personImage';

jest.mock('server-only', () => ({}));
jest.mock('../prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/auth', () => ({ getCurrentUser: jest.fn() }));

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

    it('lets only the account that claimed the page set the photo of a secondary body member (#829)', () => {
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
