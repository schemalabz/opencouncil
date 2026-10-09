/** @jest-environment node */

const mockMeetingFindFirst = jest.fn();
const mockUserFindUnique = jest.fn();

jest.mock('../../db/prisma', () => ({
    __esModule: true,
    default: {
        councilMeeting: {
            findFirst: (...args: unknown[]) => mockMeetingFindFirst(...args),
        },
        user: {
            findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
        },
    },
}));

import { requirePublicTranscript, requireVisibleMeeting } from '../gate';
import { ForbiddenError, NotFoundError } from '../../api/errors';

const USER = { type: 'user', userId: 'u1' } as const;
const SERVICE = { type: 'service', keyName: 'bot' } as const;

/** The row that the gate selects, and the payload that it returns for it. */
function row(released: boolean) {
    return {
        released,
        dateTime: new Date('2026-05-12T18:00:00Z'),
        name: null,
        name_en: null,
        kind: 'regular',
        videoUrl: null,
        administrativeBody: { name: 'Δημοτικό Συμβούλιο', name_en: 'Municipal Council', showUnreviewedTranscript: true },
        taskStatuses: [],
        city: { timezone: 'Europe/Athens' },
    };
}
function payload(released: boolean, editor: boolean | null) {
    return {
        released,
        dateTime: new Date('2026-05-12T18:00:00Z'),
        name: 'Δημοτικό Συμβούλιο · Τακτική Συνεδρίαση · 12/05/2026',
        videoUrl: null,
        administrativeBody: { name: 'Δημοτικό Συμβούλιο' },
        publicTranscript: true,
        editor,
    };
}

describe('requireVisibleMeeting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
    });

    it('passes released meetings for everyone, with the derived name', async () => {
        mockMeetingFindFirst.mockResolvedValue(row(true));
        await expect(requireVisibleMeeting('athens', 'm1', null)).resolves.toEqual(payload(true, null));
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual(payload(true, null));
        await expect(requireVisibleMeeting('athens', 'm1', SERVICE)).resolves.toEqual(payload(true, null));
    });

    it('hides unreleased meetings from anonymous and unrelated users', async () => {
        mockMeetingFindFirst.mockResolvedValue(row(false));
        await expect(requireVisibleMeeting('athens', 'm1', null)).rejects.toThrow(NotFoundError);
        await expect(requireVisibleMeeting('athens', 'm1', USER)).rejects.toThrow(NotFoundError);
    });

    it('shows unreleased meetings to service identities and city editors', async () => {
        mockMeetingFindFirst.mockResolvedValue(row(false));
        await expect(requireVisibleMeeting('athens', 'm1', SERVICE)).resolves.toEqual(payload(false, true));

        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [{ cityId: 'athens' }] });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual(payload(false, true));

        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: true, administers: [] });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).resolves.toEqual(payload(false, true));
    });

    it('hides unreleased meetings from editors of other cities', async () => {
        mockMeetingFindFirst.mockResolvedValue(row(false));
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [{ cityId: 'argos' }] });
        await expect(requireVisibleMeeting('athens', 'm1', USER)).rejects.toThrow(NotFoundError);
    });

    it('404s missing meetings for everyone', async () => {
        mockMeetingFindFirst.mockResolvedValue(null);
        await expect(requireVisibleMeeting('athens', 'nope', SERVICE)).rejects.toThrow(NotFoundError);
        await expect(requireVisibleMeeting('athens', 'nope', null)).rejects.toThrow(NotFoundError);
    });
});

describe('realm scoping', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
    });

    it('scopes the meeting lookup to the request realm', async () => {
        mockMeetingFindFirst.mockResolvedValue(row(true));
        await requireVisibleMeeting('athens', 'm1', null);

        // Default realm outside a request scope is greece; the point is that a
        // realm predicate is always present, so one realm can't read another's.
        const where = mockMeetingFindFirst.mock.calls[0][0].where;
        expect(where).toMatchObject({ cityId: 'athens', id: 'm1', city: { realm: 'greece' } });
    });
});

describe('the transcript of a visible meeting', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
    });

    it('is not public when its body waits for the review', async () => {
        const unreviewed = { ...row(true), administrativeBody: { ...row(true).administrativeBody, showUnreviewedTranscript: false } };
        mockMeetingFindFirst.mockResolvedValue(unreviewed);
        expect((await requireVisibleMeeting('athens', 'm1', null)).publicTranscript).toBe(false);
        mockMeetingFindFirst.mockResolvedValue({ ...unreviewed, taskStatuses: [{ id: 't1' }] });
        expect((await requireVisibleMeeting('athens', 'm1', null)).publicTranscript).toBe(true);
    });
});

describe('requirePublicTranscript', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [] });
    });

    it('lets everyone read a public transcript', async () => {
        await expect(requirePublicTranscript({ publicTranscript: true }, 'athens', null)).resolves.toBeUndefined();
    });

    it('withholds a transcript that is not public from readers, not from editors', async () => {
        await expect(requirePublicTranscript({ publicTranscript: false }, 'athens', null)).rejects.toThrow(ForbiddenError);
        await expect(requirePublicTranscript({ publicTranscript: false }, 'athens', USER)).rejects.toThrow(ForbiddenError);
        mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false, administers: [{ cityId: 'athens' }] });
        await expect(requirePublicTranscript({ publicTranscript: false }, 'athens', USER)).resolves.toBeUndefined();
    });
});
