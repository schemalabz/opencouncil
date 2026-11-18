/** @jest-environment node */

/**
 * No operator follows a meeting whose pipeline runs unattended (#829), so its
 * tasks send no started or completed alert to the operators' channel, as its
 * creation sends none. A failure still alerts: nothing else reports it.
 * The rule reads the type (pipelineRunsUnattended), not the tier: each body
 * carries both, and two of them carry a tier that is not the default of the type.
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
jest.mock('../../discord', () => ({ sendTaskAdminAlert: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../registry', () => ({ taskHandlers: {}, taskTerminalHooks: {} }));

import { handleTaskUpdate, startTask } from '../tasks';
import { autoTriggerTask } from '../autoTrigger';
import { sendTaskAdminAlert } from '../../discord';

const BODIES = [
  ['a meeting with no body', null, true],
  ['a council', { name: 'ΔΣ', name_en: 'Council', type: 'council', tier: 'primary' }, true],
  ['a council set to secondary', { name: 'Ζήρεια Α.Ε.', name_en: 'Zireia S.A.', type: 'council', tier: 'secondary' }, true],
  ['a youth council', { name: 'ΔΣΝ', name_en: 'Youth Council', type: 'youthCouncil', tier: 'secondary' }, false],
  ['a youth council set to primary', { name: 'ΔΣΝ', name_en: 'Youth Council', type: 'youthCouncil', tier: 'primary' }, false],
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

describe.each(BODIES)('the task alerts of %s', (_name, body, attended) => {
  it(attended ? 'are all sent' : 'are the failed alert alone', async () => {
    mockCreate.mockResolvedValue(task(body));
    mockUpdate.mockResolvedValue(task(body));
    mockFindUnique.mockResolvedValue(task(body));

    await startTask('summarize', {}, 'meeting-1', 'city-1');
    await handleTaskUpdate('task-1', { status: 'success', stage: '', progressPercent: 100, result: undefined, version: 1 }, jest.fn());
    await handleTaskUpdate('task-1', { status: 'error', stage: '', progressPercent: 100, error: 'boom', version: 1 }, jest.fn());

    const statuses = jest.mocked(sendTaskAdminAlert).mock.calls.map(([alert]) => alert.status);
    expect(statuses).toEqual(attended ? ['started', 'completed', 'failed'] : ['failed']);
  });
});

it('sends the failure alert of an automatic next step, which the unattended pipeline also takes', async () => {
  const outcome = await autoTriggerTask(
    'summarize',
    { cityId: 'city-1', meetingId: 'meeting-1', cityName: 'C', meetingName: 'M', source: { taskType: 'fixTranscript', taskId: 'task-1' } },
    () => Promise.reject(new Error('boom')),
  );

  expect(outcome).toBe('failed');
  expect(jest.mocked(sendTaskAdminAlert).mock.calls.map(([alert]) => alert.status)).toEqual(['failed']);
});
