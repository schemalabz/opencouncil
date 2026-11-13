/** @jest-environment node */
// findVoiceprintTasks feeds the voiceprint dialog of one person. The
// database filter is a text match (`contains`), so the parsed personId is the
// only thing that keeps person p1 from seeing p10's tasks.
const mockTaskFindMany = jest.fn();
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { taskStatus: { findMany: (...args: unknown[]) => mockTaskFindMany(...args) } },
}));

import { findVoiceprintTasks } from '../voiceprintTasks';

const row = (id: string, requestBody: string, responseBody: string | null = null) => ({ id, requestBody, responseBody });

beforeEach(() => mockTaskFindMany.mockReset());

describe('findVoiceprintTasks', () => {
    it('keeps only the tasks whose parsed personId is the person, though the text match also finds p10 and a segment id', async () => {
        // What `requestBody contains "p1"` returns for person p1.
        mockTaskFindMany.mockResolvedValue([
            row('t1', JSON.stringify({ personId: 'p1', cityId: 'chania', segmentId: 's1' })),
            row('t2', JSON.stringify({ personId: 'p10', cityId: 'chania', segmentId: 's2' })),
            row('t3', JSON.stringify({ personId: 'p7', cityId: 'chania', segmentId: 'p1-seg' })),
            row('t4', 'not json'),
        ]);

        const tasks = await findVoiceprintTasks('p1');

        expect(mockTaskFindMany).toHaveBeenCalledWith({
            where: { type: 'generateVoiceprint', requestBody: { contains: 'p1' } },
            orderBy: { createdAt: 'desc' },
        });
        expect(tasks.map((task) => task.id)).toEqual(['t1']);
    });
});
