/** @jest-environment node */
jest.mock('@/lib/tasks/registry', () => ({ taskHandlers: { transcribe: jest.fn() }, taskTerminalHooks: {} }));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
jest.mock('@/lib/notifications/meetingNotifications', () => ({ notifySubscribersOfTask: jest.fn() }));
jest.mock('@/lib/auth', () => ({ withUserAuthorizedToEdit: jest.fn() }));

import prisma from '@/lib/db/prisma';
import { handleTaskUpdate, processTaskResponse, checkTaskIdempotency } from '@/lib/tasks/tasks';
import { taskHandlers } from '@/lib/tasks/registry';
import { readMediaFailureResponse, hasReplayableTaskResponse } from '@/lib/tasks/mediaMetadata';
import { getTasksForMeetingDirect, MEETING_TASKS_PER_TYPE } from '@/lib/db/tasksInternal';
import { mcpTaskSummary } from '@/lib/mcp/taskSummary';
import type { TaskUpdate } from '@/lib/apiTypes';
import { resetDatabase } from '../helpers/test-db';
import { createCity, createMeeting, createTaskStatus } from '../helpers/factories';
import { loadTablesConfig } from '../../packages/seed-pipeline/src/tables';
import { maskingSql } from '../../packages/seed-pipeline/src/masking';
import fixture from '../fixtures/media-contract.json';

beforeEach(async () => {
    jest.clearAllMocks();
    await resetDatabase(prisma);
    await createCity({ id: 'media-city' });
    await createMeeting('media-city', { id: 'media-meeting' });
});
const makeTask = () => createTaskStatus('media-meeting', 'media-city', { type: 'transcribe', requestBody: '{"youtubeUrl":"https://video.test/watch?v=public"}' });
const summaries = async () => (await getTasksForMeetingDirect('media-city', 'media-meeting')).map(mcpTaskSummary);
const success = { status: 'success', stage: 'finished', progressPercent: 100, version: 6, result: { source: fixture.source, transcript: 'kept' } } as const;
const failure = fixture.permanentUpdate as TaskUpdate<never>;
const progress = { status: 'processing', stage: 'late progress', progressPercent: 1, version: 1 } as const;
const storedTask = (id: string) => prisma.taskStatus.findUniqueOrThrow({ where: { id } });

it.each(['permanentUpdate', 'retryableUpdate', 'legacyErrorUpdate'] as const)('stores %s without treating it as a result', async key => {
    const task = await makeTask();
    const update = fixture[key] as TaskUpdate<never>;
    const handler = jest.fn();
    await handleTaskUpdate(task.id, update, handler);
    const stored = await storedTask(task.id);
    expect(stored.failureReason).toBe(update.error);
    expect(readMediaFailureResponse(stored.responseBody)).toEqual(update.mediaFailure);
    expect(hasReplayableTaskResponse(stored.responseBody)).toBe(false);
    expect(stored.requestBody).toBe(task.requestBody);
    await handleTaskUpdate(task.id, { ...failure, error: 'duplicate error' }, handler);
    await handleTaskUpdate(task.id, progress, handler);
    expect(await storedTask(task.id)).toEqual(stored);
    const summary = (await summaries())[0];
    expect(summary.error).toBe(update.error);
    if (update.mediaFailure) expect(summary.mediaFailure).toEqual(update.mediaFailure);
    else expect(summary).not.toHaveProperty('mediaFailure');
    await expect(processTaskResponse('transcribe', task.id)).rejects.toThrow('no result to replay');
    expect(handler).not.toHaveBeenCalled();
    expect(taskHandlers.transcribe).not.toHaveBeenCalled();
});

it('keeps an accepted success payload during persistence and after completion', async () => {
    const task = await makeTask();
    let accepted!: () => void;
    let finish!: () => void;
    const entered = new Promise<void>(resolve => { accepted = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const handler = jest.fn(async () => { accepted(); await gate; });
    const first = handleTaskUpdate(task.id, success, handler);
    await entered;
    const claimed = await storedTask(task.id);
    await handleTaskUpdate(task.id, { ...success, result: { ...success.result, transcript: 'duplicate' } }, handler);
    await handleTaskUpdate(task.id, failure, handler);
    await handleTaskUpdate(task.id, progress, handler);
    expect(await storedTask(task.id)).toEqual(claimed);
    finish();
    await first;
    await handleTaskUpdate(task.id, failure, handler);
    await handleTaskUpdate(task.id, progress, handler);
    const stored = await storedTask(task.id);
    expect(stored.status).toBe('succeeded');
    expect(JSON.parse(stored.responseBody!)).toEqual(success.result);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await summaries())[0]).not.toHaveProperty('source');
    await processTaskResponse('transcribe', task.id);
    expect(taskHandlers.transcribe).toHaveBeenCalledWith(task.id, success.result, undefined);
});

it('replaces a failure envelope with a later successful result', async () => {
    const task = await makeTask();
    await handleTaskUpdate(task.id, failure, jest.fn());
    await handleTaskUpdate(task.id, success, jest.fn());
    const stored = await storedTask(task.id);
    expect(stored.status).toBe('succeeded');
    expect(stored.failureReason).toBeNull();
    expect(stored.requestBody).toBe(task.requestBody);
    expect(readMediaFailureResponse(stored.responseBody)).toBeUndefined();
    expect(JSON.parse(stored.responseBody!).source).toEqual(fixture.source);
    expect((await summaries())[0]).not.toHaveProperty('mediaFailure');
});

it('protects a recovering failed task while the successful result is being imported', async () => {
    const task = await makeTask();
    await handleTaskUpdate(task.id, failure, jest.fn());
    let entered!: () => void;
    let finish!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const handler = jest.fn(async () => { entered(); await gate; });
    const recovery = handleTaskUpdate(task.id, success, handler);
    await started;
    try {
        expect((await storedTask(task.id)).status).toBe('pending');
        await expect(processTaskResponse('transcribe', task.id)).rejects.toThrow('still persisting its result');
        expect(await checkTaskIdempotency('transcribe', 'media-city', 'media-meeting'))
            .toMatchObject({ proceed: false, blockedReason: 'already_running' });
        expect(taskHandlers.transcribe).not.toHaveBeenCalled();
    } finally {
        finish();
        await recovery;
    }
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await storedTask(task.id)).status).toBe('succeeded');
});

it('lets a success win a concurrent failure without overwriting another accepted result', async () => {
    for (let index = 0; index < 3; index++) {
        const task = await makeTask();
        const handler = jest.fn();
        await Promise.all([handleTaskUpdate(task.id, failure, handler), handleTaskUpdate(task.id, success, handler)]);
        expect((await storedTask(task.id)).status).toBe('succeeded');
        expect(JSON.parse((await storedTask(task.id)).responseBody!)).toEqual(success.result);
        expect(handler).toHaveBeenCalledTimes(1);
    }
});

it('clears the envelope on result-less success without making it replayable', async () => {
    const task = await makeTask();
    await handleTaskUpdate(task.id, failure, jest.fn());
    await handleTaskUpdate(task.id, { ...success, result: undefined }, jest.fn());
    const stored = await storedTask(task.id);
    expect(stored.status).toBe('succeeded');
    expect(stored.failureReason).toBeNull();
    expect(stored.responseBody).toBeNull();
});

it('omits malformed callback metadata and keeps legacy success results', async () => {
    const task = await makeTask();
    await handleTaskUpdate(task.id, { ...success, result: { ok: true } }, jest.fn());
    expect((await summaries())[0]).not.toHaveProperty('source');
    const failed = await makeTask();
    await handleTaskUpdate(failed.id, { ...failure, mediaFailure: { reason: 'invented', retryable: true } } as unknown as TaskUpdate<never>, jest.fn());
    expect((await storedTask(failed.id)).responseBody).toBeNull();
});

it('polls no transcript bodies and safely ignores malformed legacy failure bodies', async () => {
    for (const body of ['not JSON', '[null]', '"legacy text"', '{"source":', '{"source":{"kind":"wrong"}}']) {
        await createTaskStatus('media-meeting', 'media-city', { type: 'transcribe', status: 'failed', responseBody: body });
    }
    const tasks = await getTasksForMeetingDirect('media-city', 'media-meeting');
    expect(tasks).toHaveLength(MEETING_TASKS_PER_TYPE);
    for (const row of tasks) {
        expect(row).not.toHaveProperty('responseBody');
        expect(row).not.toHaveProperty('requestBody');
        expect(mcpTaskSummary(row)).not.toHaveProperty('source');
        expect(mcpTaskSummary(row)).not.toHaveProperty('mediaFailure');
    }
    const newest = await createTaskStatus('media-meeting', 'media-city', { type: 'transcribe', status: 'succeeded', createdAt: new Date(Date.now() + 1000), responseBody: JSON.stringify({ source: fixture.source, transcript: 'x'.repeat(1_000_000) }) });
    const bounded = await getTasksForMeetingDirect('media-city', 'media-meeting');
    expect(bounded).toHaveLength(MEETING_TASKS_PER_TYPE);
    expect(bounded.find(row => row.id === newest.id)).not.toHaveProperty('mediaSource');
    expect(JSON.stringify(bounded).length).toBeLessThan(10000);
});

it('stores only sanitized source metadata in replayable success payloads', async () => {
    const task = await makeTask();
    const source = { kind: 'file', webpageUrl: 'https://u:p@video.test/watch?v=public&token=secret#fragment', thumbnailUrl: 'https://video.test/thumb?X-Amz-Credential=secret' };
    await handleTaskUpdate(task.id, { ...success, result: { source } }, jest.fn());
    const safe = { kind: 'file', webpageUrl: 'https://video.test/watch?v=public', thumbnailUrl: 'https://video.test/thumb' };
    expect(JSON.parse((await storedTask(task.id)).responseBody!).source).toEqual(safe);
    expect((await summaries())[0]).not.toHaveProperty('source');
});

it('redacts URL credentials while keeping plain failureReason text', async () => {
    const task = await makeTask();
    await handleTaskUpdate(task.id, { ...failure, error: 'HTTP 503 https://u:p@video.test/private?token=secret#frag', mediaFailure: { reason: 'error', retryable: true, hint: 'Try https://video.test/private?sig=secret' } }, jest.fn());
    expect((await storedTask(task.id)).failureReason).toBe('HTTP 503 https://video.test');
    expect((await summaries())[0]).toMatchObject({ error: 'HTTP 503 https://video.test', mediaFailure: { reason: 'error', retryable: true, hint: 'Try https://video.test' } });
});

it('seed masking deletes failure envelopes without touching malformed legacy prose or successful results', async () => {
    const failed = await makeTask();
    await handleTaskUpdate(failed.id, failure, jest.fn());
    const legacy = await createTaskStatus('media-meeting', 'media-city', { type: 'transcribe', status: 'failed', responseBody: 'legacy non-JSON prose' });
    const succeeded = await createTaskStatus('media-meeting', 'media-city', { type: 'transcribe', status: 'succeeded', responseBody: JSON.stringify(success.result) });
    const rule = loadTablesConfig().masking.find(rule => rule.table === 'TaskStatus' && rule.action === 'delete-when' && rule.when.includes('media-source-failure-v1'));
    expect(rule).toBeDefined();
    await prisma.$executeRawUnsafe(maskingSql(rule!));
    expect(await prisma.taskStatus.findUnique({ where: { id: failed.id } })).toBeNull();
    expect(await storedTask(legacy.id)).toBeDefined();
    expect(await storedTask(succeeded.id)).toBeDefined();
});

it.each(['\u0000', '\ud800'])('ignores JSONB-incompatible transcript text safely: %j', async transcript => {
    const task = await createTaskStatus('media-meeting', 'media-city', { type: 'transcribe', status: 'failed', responseBody: JSON.stringify({ transcript, source: fixture.source }) });
    const tasks = await getTasksForMeetingDirect('media-city', 'media-meeting');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).not.toHaveProperty('mediaSource');
    expect(tasks[0].mediaFailure).toBeUndefined();
    const rule = loadTablesConfig().masking.find(rule => rule.table === 'TaskStatus' && rule.action === 'delete-when' && rule.when.includes('media-source-failure-v1'));
    await prisma.$executeRawUnsafe(maskingSql(rule!));
    expect(await storedTask(task.id)).toBeDefined();
});

it('runs on the unchanged TaskStatus schema without metadata columns', async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'TaskStatus'
            AND column_name IN ('mediaSource', 'mediaFailure')
    `;
    expect(columns).toEqual([]);
});
