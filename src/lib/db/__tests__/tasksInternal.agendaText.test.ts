/** @jest-environment node */

const mockCreate = jest.fn();
jest.mock('../prisma', () => ({ __esModule: true, default: { taskStatus: { create: (...args: unknown[]) => mockCreate(...args) } } }));

import { recordAgendaTextTask } from '../tasksInternal';

it('records a pasted agenda as a succeeded processAgenda task, with the text and the subjects a re-run replays', async () => {
    mockCreate.mockResolvedValue({ id: 'task1' });
    const subjects = [{ name: 'Σχολικές αυλές', agendaItemIndex: 1 }];

    await recordAgendaTextTask('chania', 'youth_feb14_2026', '1. Σχολικές αυλές', subjects);

    expect(mockCreate).toHaveBeenCalledWith({
        data: {
            type: 'processAgenda',
            status: 'succeeded',
            requestBody: JSON.stringify({ source: 'agendaText', agendaText: '1. Σχολικές αυλές' }),
            responseBody: JSON.stringify({ subjects }),
            councilMeeting: { connect: { cityId_id: { cityId: 'chania', id: 'youth_feb14_2026' } } },
        },
    });
});
