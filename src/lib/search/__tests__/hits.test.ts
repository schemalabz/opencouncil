import type { EsHit } from '../hits';

jest.mock('@/env.mjs', () => ({ env: { DEPLOYMENT_ENV: 'production' } }));
jest.mock('@/lib/discord', () => ({
    sendErrorAdminAlert: jest.fn().mockResolvedValue(undefined),
}));

// hits.ts keeps module-level state (the reported-ids set) and reads env at
// import time, so each case loads a fresh copy with the env it needs. The
// discord mock factory re-runs per isolated registry, giving a clean spy too.
const load = (deploymentEnv: string) => {
    let hits!: typeof import('../hits');
    let discord!: { sendErrorAdminAlert: jest.Mock };
    jest.isolateModules(() => {
        jest.doMock('@/env.mjs', () => ({ env: { DEPLOYMENT_ENV: deploymentEnv } }));
        discord = require('@/lib/discord');
        hits = require('../hits');
    });
    return { ...hits, alert: discord.sendErrorAdminAlert };
};

const hit = (id?: string): EsHit => (id === undefined ? {} : { _source: { id } });

describe('partitionHits', () => {
    const { partitionHits } = load('production');

    it('resolves hits whose subject exists in the map', () => {
        const subjectMap = new Map([['a', { name: 'A' }], ['b', { name: 'B' }]]);
        const { resolved, orphanedIds, droppedWithoutSource } = partitionHits(
            [hit('a'), hit('b')], subjectMap,
        );
        expect(resolved.map(r => r.subject.name)).toEqual(['A', 'B']);
        expect(orphanedIds).toEqual([]);
        expect(droppedWithoutSource).toBe(0);
    });

    it('collects orphaned ids for hits missing from the map, preserving resolved order', () => {
        const subjectMap = new Map([['a', { name: 'A' }]]);
        const { resolved, orphanedIds } = partitionHits(
            [hit('ghost-1'), hit('a'), hit('ghost-2')], subjectMap,
        );
        expect(resolved.map(r => r.subject.name)).toEqual(['A']);
        expect(orphanedIds).toEqual(['ghost-1', 'ghost-2']);
    });

    it('drops hits without a _source id', () => {
        const subjectMap = new Map([['a', { name: 'A' }]]);
        const { resolved, orphanedIds, droppedWithoutSource } = partitionHits(
            [hit(undefined), hit('a')], subjectMap,
        );
        expect(resolved).toHaveLength(1);
        expect(orphanedIds).toEqual([]);
        expect(droppedWithoutSource).toBe(1);
    });

    it('handles an empty hits array', () => {
        const { resolved, orphanedIds, droppedWithoutSource } = partitionHits([], new Map());
        expect(resolved).toEqual([]);
        expect(orphanedIds).toEqual([]);
        expect(droppedWithoutSource).toBe(0);
    });
});

describe('reportOrphanedHits', () => {
    it('sends a Discord alert on production with the orphaned ids', async () => {
        const { reportOrphanedHits, alert } = load('production');
        await reportOrphanedHits({ orphanedIds: ['x', 'y'], query: 'ποδηλατόδρομοι', index: 'subjects' });
        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert.mock.calls[0][0].source).toBe('Search');
        expect(alert.mock.calls[0][0].context?.orphanedSubjectIds).toBe('x, y');
    });

    it('reports each id at most once per module instance', async () => {
        const { reportOrphanedHits, alert } = load('production');
        await reportOrphanedHits({ orphanedIds: ['x'], query: 'q1', index: 'subjects' });
        await reportOrphanedHits({ orphanedIds: ['x'], query: 'q2', index: 'subjects' });
        expect(alert).toHaveBeenCalledTimes(1);

        // A new id alongside an already-reported one alerts for the new id only
        await reportOrphanedHits({ orphanedIds: ['x', 'z'], query: 'q3', index: 'subjects' });
        expect(alert).toHaveBeenCalledTimes(2);
        expect(alert.mock.calls[1][0].context?.orphanedSubjectIds).toBe('z');
    });

    it('dedupes duplicate ids within a single call', async () => {
        const { reportOrphanedHits, alert } = load('production');
        await reportOrphanedHits({ orphanedIds: ['x', 'x'], query: 'q', index: 'subjects' });
        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert.mock.calls[0][0].context?.orphanedSubjectIds).toBe('x');
        expect(alert.mock.calls[0][0].error).toContain('1 orphaned hit(s)');
    });

    it('alerts on production for source-less hits, once per module instance', async () => {
        const { reportOrphanedHits, alert } = load('production');
        await reportOrphanedHits({ orphanedIds: [], droppedWithoutSource: 2, query: 'q', index: 'subjects' });
        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert.mock.calls[0][0].context?.droppedWithoutSource).toBe('2');
        expect(alert.mock.calls[0][0].context?.orphanedSubjectIds).toBeUndefined();

        await reportOrphanedHits({ orphanedIds: [], droppedWithoutSource: 5, query: 'q2', index: 'subjects' });
        expect(alert).toHaveBeenCalledTimes(1);
    });

    it('only warns (no Discord) outside production', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { reportOrphanedHits, alert } = load('staging');
        await reportOrphanedHits({ orphanedIds: ['x'], query: 'q', index: 'subjects' });
        expect(alert).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('orphaned'), expect.objectContaining({ orphanedIds: ['x'] }));
        warn.mockRestore();
    });

    it('no-ops when there is nothing to report', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { reportOrphanedHits, alert } = load('production');
        await reportOrphanedHits({ orphanedIds: [], query: 'q', index: 'subjects' });
        expect(alert).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
