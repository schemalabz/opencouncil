import { getTranslations } from 'next-intl/server';
import { getRoleTitles } from '../roleTitles';
import { getRoleTitle } from '@/lib/utils/roles';
import { buildSpeakerRoster } from '@/lib/tasks/speakerRoster';
import type { PersonWithRelations } from '@/lib/db/people';
import { roleTitlesFor } from '../../../tests/helpers/catalog';

jest.mock('next-intl/server', () => ({ getTranslations: jest.fn() }));

beforeEach(() => {
    jest.mocked(getTranslations).mockResolvedValue(roleTitlesFor('en').t as Awaited<ReturnType<typeof getTranslations>>);
});

it('keeps an English council leader title in task speaker rosters', async () => {
    const titles = await getRoleTitles('en');
    const person = {
        id: 'leader', name: 'Jane Smith', roles: [{
            cityId: 'city', isHead: true, name: 'Council Leader',
            partyId: null, administrativeBodyId: null, startDate: null, endDate: null,
        }],
    } as PersonWithRelations;
    const [speaker] = buildSpeakerRoster([person], new Date('2026-10-01'), null, titles);
    expect(speaker.role).toBe('Council Leader');
});

it('distinguishes an English translation from native English content', async () => {
    const titles = await getRoleTitles('en', 'el');
    expect(getRoleTitle({ cityId: 'city', isHead: true, name: 'Δήμαρχος' }, titles)).toBe('Mayor');
});

it('keeps stored titles when a content language uses the English catalog fallback', async () => {
    const titles = await getRoleTitles('bs');
    expect(getTranslations).toHaveBeenLastCalledWith({ locale: 'en', namespace: 'Person' });
    expect(getRoleTitle({ cityId: 'city', isHead: true, name: 'Gradonačelnik' }, titles)).toBe('Gradonačelnik');
});
