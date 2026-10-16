jest.mock('@/lib/actions/meetingFacts', () => ({ requestReadTranscriptFacts: jest.fn() }));
jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));

import { failureOf, landed, type MeetingFactSource, type PendingRead } from '../useMeetingFactSources';

const row = (o: Partial<MeetingFactSource> & Pick<MeetingFactSource, 'source'>): MeetingFactSource => ({
    id: `r-${o.source}`, status: 'read', fileName: null, mediaType: null, reading: null, readerVersion: null,
    taskId: 't1', uploadedById: null, confirmedById: null, confirmedAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...o,
});

describe('landed', () => {
    it('a transcript read has not landed while the transcript has no row: its result creates the row', () => {
        const pending: PendingRead = { source: 'transcript', taskId: 't1', baselineUpdatedAt: null };
        expect(landed(pending, [])).toBe(false);
        expect(landed(pending, [row({ source: 'transcript', taskId: 't1' })])).toBe(true);
        expect(landed(pending, [row({ source: 'transcript', taskId: 't0' })])).toBe(false);
    });
    it('a sheet read whose row is gone has nothing left to wait for', () => {
        const pending: PendingRead = { source: 'sheet', taskId: 't1', baselineUpdatedAt: null };
        expect(landed(pending, [])).toBe(true);
        expect(landed(pending, [row({ source: 'sheet', status: 'uploaded' })])).toBe(false);
        expect(landed(pending, [row({ source: 'sheet', status: 'read' })])).toBe(true);
    });
});

describe('failureOf', () => {
    // The row() helper writes updatedAt 2026-01-01; a read asked for later is newer than the row.
    const failed = { taskId: 't9', status: 'failed', createdAt: '2026-02-01T00:00:00.000Z', error: 'no credit' };
    it('shows a sheet read failure only while the row still holds that task', () => {
        expect(failureOf('sheet', [row({ source: 'sheet', taskId: 't9' })], failed)).toBe('no credit');
        // The sheet was replaced: its task is cleared, and the old file's error is not the new file's.
        expect(failureOf('sheet', [row({ source: 'sheet', taskId: null })], failed)).toBeNull();
        expect(failureOf('sheet', [], failed)).toBeNull();
    });
    it('shows a transcript read failure until a reading lands after it, and nothing for a read that did not fail', () => {
        expect(failureOf('transcript', [row({ source: 'transcript', taskId: 't1' })], failed)).toBe('no credit');
        expect(failureOf('transcript', [], failed)).toBe('no credit');
        // fixTranscript stored a newer reading after the failed read was asked for.
        expect(failureOf('transcript', [row({ source: 'transcript', taskId: 'fix', updatedAt: '2026-03-01T00:00:00.000Z' })], failed)).toBeNull();
        expect(failureOf('transcript', [], { taskId: 't9', status: 'succeeded', createdAt: '2026-02-01T00:00:00.000Z', error: null })).toBeNull();
        expect(failureOf('transcript', [], null)).toBeNull();
    });
});

describe('landed, for a transcript read another reading overtook', () => {
    const pending: PendingRead = { source: 'transcript', taskId: 't9', baselineUpdatedAt: null };
    const read = (status: string) => ({ taskId: 't9', status, createdAt: '2026-02-01T00:00:00.000Z', error: null });
    it('ends the wait once the read finished and a newer reading was stored after it was asked for', () => {
        const newer = row({ source: 'transcript', taskId: 'fix', updatedAt: '2026-03-01T00:00:00.000Z' });
        expect(landed(pending, [newer], read('succeeded'))).toBe(true);
        // Still running: the wait goes on, whatever the row says.
        expect(landed(pending, [newer], read('pending'))).toBe(false);
    });
    it('keeps waiting while the row only holds a reading older than the read', () => {
        expect(landed(pending, [row({ source: 'transcript', taskId: 'old' })], read('succeeded'))).toBe(false);
    });
});
