/** @jest-environment node */
/**
 * Only a superadmin decides the tier of a body (#829). The rule reads the
 * body that a write leaves, not the keys of the request: a request with no
 * tier that changes the type still changes which tier the type stands for.
 */
const mockFindUnique = jest.fn();
const mockCityFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockWithUserAuthorizedToEdit = jest.fn();

jest.mock('@/lib/db/prisma', () => {
    const client = {
        administrativeBody: {
            findUnique: (...a: unknown[]) => mockFindUnique(...a),
            create: (...a: unknown[]) => mockCreate(...a),
            update: (...a: unknown[]) => mockUpdate(...a),
        },
        city: { findUnique: (...a: unknown[]) => mockCityFindUnique(...a) },
        $transaction: (run: (tx: unknown) => Promise<unknown>) => run(client),
    };
    return { __esModule: true, default: client };
});
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...a: unknown[]) => mockWithUserAuthorizedToEdit(...a),
    getCurrentUser: jest.fn(),
}));

import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/api/errors';
import { createAdministrativeBody, editAdministrativeBody } from '@/lib/db/administrativeBodies';

const YOUTH = { name: 'Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil' as const };
const NEW_BODY = {
    ...YOUTH,
    cityId: 'zografou',
    tier: 'secondary' as const,
    notificationBehavior: 'NOTIFICATIONS_DISABLED' as const,
    showUnreviewedTranscript: true,
    youtubeChannelUrl: null,
    diavgeiaUnitIds: [],
};

/** An admin of the city: every scope but the superadmin one ({}). */
function asCityAdmin() {
    mockWithUserAuthorizedToEdit.mockImplementation(async (scope: object) => {
        if (Object.keys(scope).length === 0) throw new ForbiddenError();
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    asCityAdmin();
    mockCityFindUnique.mockResolvedValue({ authorityType: 'municipality' });
    const row = ({ data }: { data: object }) => Promise.resolve({ id: 'b1', decisionConventions: null, ...data });
    mockCreate.mockImplementation(row);
    mockUpdate.mockImplementation(row);
});

describe('createAdministrativeBody: the tier of a new body', () => {
    it('answers 403 to a city admin who creates a youth council in the primary tier, and creates nothing', async () => {
        await expect(createAdministrativeBody({ ...NEW_BODY, tier: 'primary' })).rejects.toThrow(ForbiddenError);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('creates a body in the default tier of its type for a city admin', async () => {
        await createAdministrativeBody(NEW_BODY);
        expect(mockWithUserAuthorizedToEdit).not.toHaveBeenCalledWith({});
        expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'youthCouncil', tier: 'secondary' }) });
    });

    it('creates a body in another tier for a superadmin', async () => {
        mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
        await createAdministrativeBody({ ...NEW_BODY, type: 'council', tier: 'secondary' });
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({});
        expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'council', tier: 'secondary' }) });
    });
});

describe('editAdministrativeBody: the tier that the edit leaves', () => {
    const stored = (type: string, tier: string) => mockFindUnique.mockResolvedValue({ cityId: 'zografou', type, tier });

    it('answers 403 to a city admin who moves a secondary body to the primary tier, and writes nothing', async () => {
        stored('youthCouncil', 'secondary');
        await expect(editAdministrativeBody('b1', { ...YOUTH, tier: 'primary' })).rejects.toThrow(ForbiddenError);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('answers 403 to a city admin who retypes a youth council to a council with no tier, and writes nothing', async () => {
        // The request keeps the stored tier, so the result would be a secondary council.
        stored('youthCouncil', 'secondary');
        await expect(editAdministrativeBody('b1', { ...YOUTH, type: 'council' })).rejects.toThrow(ForbiddenError);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('answers 403 to a city admin who retypes a council to a youth council, and writes nothing', async () => {
        stored('council', 'primary');
        await expect(editAdministrativeBody('b1', { ...YOUTH, type: 'youthCouncil' })).rejects.toThrow(ForbiddenError);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('lets a city admin retype a body inside the default tier of its type', async () => {
        stored('committee', 'primary');
        await editAdministrativeBody('b1', { name: 'Επιτροπή', type: 'community' });
        expect(mockWithUserAuthorizedToEdit).not.toHaveBeenCalledWith({});
        expect(mockUpdate).toHaveBeenCalled();
    });

    it('lets a city admin edit the name of a body that a superadmin put in another tier', async () => {
        stored('council', 'secondary');
        await editAdministrativeBody('b1', { name: 'Ζήρεια Α.Ε.', type: 'council', tier: 'secondary' });
        await editAdministrativeBody('b1', { name: 'Ζήρεια Α.Ε.', type: 'council' });
        expect(mockWithUserAuthorizedToEdit).not.toHaveBeenCalledWith({});
        expect(mockUpdate).toHaveBeenCalledTimes(2);
    });

    it('lets a superadmin change the tier and the type', async () => {
        mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
        stored('youthCouncil', 'secondary');
        await editAdministrativeBody('b1', { ...YOUTH, type: 'council' });
        expect(mockWithUserAuthorizedToEdit).toHaveBeenCalledWith({});
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'council' }) }));
    });
});

describe('the body types of a region (#993)', () => {
    const COMMITTEE = { ...NEW_BODY, name: 'Περιφερειακή Επιτροπή', name_en: 'Regional Committee', type: 'committee' as const, tier: 'primary' as const };
    const stored = (type: string) => mockFindUnique.mockResolvedValue({ cityId: 'thessaly', type, tier: 'primary' });

    beforeEach(() => {
        mockWithUserAuthorizedToEdit.mockResolvedValue(undefined);
        mockCityFindUnique.mockResolvedValue({ authorityType: 'region' });
    });

    it.each(['council', 'committee'] as const)('creates a %s', async type => {
        await createAdministrativeBody({ ...COMMITTEE, type });
        expect(mockCityFindUnique).toHaveBeenCalledWith({ where: { id: 'zografou' }, select: { authorityType: true } });
        expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ type }) });
    });

    it.each(['community', 'youthCouncil'] as const)('answers 400 to a new %s, and creates nothing', async type => {
        await expect(createAdministrativeBody({ ...COMMITTEE, type })).rejects.toThrow(BadRequestError);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('answers 400 to an edit that makes a committee a community, and writes nothing', async () => {
        stored('committee');
        await expect(editAdministrativeBody('b1', { type: 'community' })).rejects.toThrow(BadRequestError);
        expect(mockCityFindUnique).toHaveBeenCalledWith({ where: { id: 'thessaly' }, select: { authorityType: true } });
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('lets an edit make a committee a council', async () => {
        stored('committee');
        await editAdministrativeBody('b1', { type: 'council' });
        expect(mockUpdate).toHaveBeenCalled();
    });

    // A row that predates the rule stays editable: only a change of type meets the rule.
    it('edits a body of a type that a region does not have, when the type stays', async () => {
        stored('community');
        await editAdministrativeBody('b1', { name: 'Κοινότητα', type: 'community' });
        await editAdministrativeBody('b1', { name: 'Κοινότητα' });
        expect(mockCityFindUnique).not.toHaveBeenCalled();
        expect(mockUpdate).toHaveBeenCalledTimes(2);
    });

    it('answers 404 to a new body of a city that does not exist', async () => {
        mockCityFindUnique.mockResolvedValue(null);
        await expect(createAdministrativeBody(COMMITTEE)).rejects.toThrow(NotFoundError);
        expect(mockCreate).not.toHaveBeenCalled();
    });
});
