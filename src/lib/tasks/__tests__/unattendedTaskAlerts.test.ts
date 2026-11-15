/** @jest-environment node */

/**
 * No operator follows a meeting whose pipeline runs unattended (#829), so its
 * tasks send no alert to the operators' channel, as its creation sends none.
 * The rule reads the type (pipelineRunsUnattended), not the tier.
 */
const mockFindFirst = jest.fn();
const mockFindUnique = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn();
const prismaStub = {
  $executeRaw: jest.fn().mockResolvedValue(0),
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(prismaStub),
  taskStatus: {
    findFirst: (...args: unknown[]) => mockFindFirst(...args),
    findUnique: (...args: unknown[]) => mockFindUnique(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    updateMany: (...args: unknown[]) => mockUpdateMany(...args),
  },
};
jest.mock('@/lib/notifications/meetingNotifications', () => ({ notifySubscribersOfTask: jest.fn() }));
jest.mock('../../db/prisma', () => ({ __esModule: true, default: prismaStub }));
jest.mock('@/env.mjs', () => ({ env: { NEXTAUTH_URL: 'http://test', NEXTAUTH_SECRET: 'test-secret', TASK_API_URL: 'http://test', TASK_API_KEY: 'key' } }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('../../auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));
jest.mock('../pipelineRules', () => ({ findConflictingTask: jest.fn().mockResolvedValue(null) }));
jest.mock('../../discord', () => ({ sendTaskAdminAlert: jest.fn() }));
jest.mock('../registry', () => ({ taskHandlers: {}, taskTerminalHooks: {} }));

import { handleTaskUpdate, startTask } from '../tasks';
import { sendTaskAdminAlert } from '../../discord';

const BODIES = [
  ['a meeting with no body', null, true],
  ['a council', { name: 'ΔΣ', name_en: 'Council', type: 'council' }, true],
  ['a youth council', { name: 'ΔΣΝ', name_en: 'Youth Council', type: 'youthCouncil' }, false],
] as const;

function task(administrativeBody: (typeof BODIES)[number][1]) {
  return {
    id: 'task-1',
    type: 'summarize',
    status: 'pending',
    stage: 'enrichment',
    cityId: 'city-1',
    councilMeetingId: 'meeting-1',
    createdAt: new Date(),
    responseBody: null,
    councilMeeting: { name_en: 'M', city: { name_en: 'C' }, administrativeBody },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindFirst.mockResolvedValue(null);
  mockUpdateMany.mockResolvedValue({ count: 1 });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '{}' });
});

describe.each(BODIES)('the task alerts of %s', (_name, body, alerted) => {
  it(alerted ? 'are sent' : 'are not sent', async () => {
    mockCreate.mockResolvedValue(task(body));
    mockUpdate.mockResolvedValue(task(body));
    mockFindUnique.mockResolvedValue(task(body));

    await startTask('summarize', {}, 'meeting-1', 'city-1');
    await handleTaskUpdate('task-1', { status: 'success', stage: '', progressPercent: 100, result: undefined, version: 1 }, jest.fn());
    await handleTaskUpdate('task-1', { status: 'error', stage: '', progressPercent: 100, error: 'boom', version: 1 }, jest.fn());

    const statuses = jest.mocked(sendTaskAdminAlert).mock.calls.map(([alert]) => alert.status);
    expect(statuses).toEqual(alerted ? ['started', 'completed', 'failed'] : []);
  });
});
