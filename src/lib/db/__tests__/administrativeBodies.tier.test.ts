/** @jest-environment node */
/**
 * Only a superadmin decides the tier of a body (#829). The rule reads the
 * body that a write leaves, not the keys of the request: a request with no
 * tier that changes the type still changes which tier the type stands for.
 */
const mockFindUnique = jest.fn();
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
        $transaction: (run: (tx: unknown) => Promise<unknown>) => run(client),
    };
    return { __esModule: true, default: client };
});
jest.mock('@/lib/auth', () => ({
    withUserAuthorizedToEdit: (...a: unknown[]) => mockWithUserAuthorizedToEdit(...a),
    getCurrentUser: jest.fn(),
}));

import { ForbiddenError } from '@/lib/api/errors';
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
