/** @jest-environment node */
import type { ReactElement } from 'react';

/**
 * The configurator belongs to the editors of the city. With `?body=`, it
 * belongs to the admins of that body and shows that body alone (#829).
 */
const mockIsUserAuthorizedToEdit = jest.fn();
const mockGetBodyPageRow = jest.fn();
const mockGetMeetings = jest.fn();
const mockNotFound = jest.fn(() => { throw new Error('notFound'); });

jest.mock('next/navigation', () => ({ notFound: () => mockNotFound() }));
jest.mock('@/lib/auth', () => ({ isUserAuthorizedToEdit: (...a: unknown[]) => mockIsUserAuthorizedToEdit(...a) }));
jest.mock('@/lib/cache', () => ({
    getCityCached: jest.fn().mockResolvedValue({ id: 'chania', name: 'Χανιά', timezone: 'Europe/Athens' }),
    getAdministrativeBodiesWithPublicMeetingsCached: jest.fn().mockResolvedValue([
        { id: 'council', name: 'Δημοτικό Συμβούλιο', name_en: 'Council', type: 'council', cityId: 'chania' },
        { id: 'youth', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil', cityId: 'chania' },
    ]),
    getCouncilMeetingsForCityPublicCached: (...a: unknown[]) => mockGetMeetings(...a),
}));
jest.mock('@/lib/db/administrativeBodies', () => ({ getBodyPageRow: (...a: unknown[]) => mockGetBodyPageRow(...a) }));
jest.mock('@/components/embed/EmbedConfigurator', () => ({ EmbedConfigurator: (props: unknown) => props }));

import WidgetPage from '../page';

const YOUTH = { id: 'youth', name: 'Δημοτικό Συμβούλιο Νέων', name_en: 'Youth Council', type: 'youthCouncil' };

function render(body?: string) {
    return WidgetPage({
        params: Promise.resolve({ cityId: 'chania' }),
        searchParams: Promise.resolve(body === undefined ? {} : { body }),
    }) as Promise<ReactElement<Record<string, unknown>>>;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetMeetings.mockResolvedValue([]);
    mockGetBodyPageRow.mockResolvedValue(YOUTH);
});

describe('the widget configurator', () => {
    it('asks for an editor of the city, and offers every body with public meetings', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(true);
        const page = await render();
        expect(mockIsUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'chania' });
        expect(mockGetMeetings).toHaveBeenCalledWith('chania', { limit: 20, timeFilter: 'past' });
        expect(page.props.lockedBody).toBeNull();
        expect((page.props.bodyGroups as Array<{ type: string }>).map(g => g.type)).toEqual(['council', 'youthCouncil']);
    });

    it('asks for an admin of the body named by ?body=, and locks the configurator to it', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(true);
        const page = await render('youth');
        expect(mockIsUserAuthorizedToEdit).toHaveBeenCalledWith({ cityId: 'chania', administrativeBodyId: 'youth' });
        expect(mockGetMeetings).toHaveBeenCalledWith('chania', { limit: 20, timeFilter: 'past', administrativeBodyIds: ['youth'] });
        expect(page.props.lockedBody).toEqual(YOUTH);
        expect(page.props.bodyGroups).toEqual([{ type: 'youthCouncil', bodies: [{ id: 'youth', name: YOUTH.name, name_en: YOUTH.name_en }] }]);
    });

    it('is not found for a reader, with or without a body', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(false);
        await expect(render()).rejects.toThrow('notFound');
        await expect(render('youth')).rejects.toThrow('notFound');
    });

    it('is not found for a body that is not of the city', async () => {
        mockIsUserAuthorizedToEdit.mockResolvedValue(true);
        mockGetBodyPageRow.mockResolvedValue(null);
        await expect(render('elsewhere')).rejects.toThrow('notFound');
    });
});
