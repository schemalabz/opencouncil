import { pendingPollTaskId } from '../pollDecisionsBackoff';

describe('pendingPollTaskId', () => {
    it('names a poll task that is still running', () => {
        expect(pendingPollTaskId([
            { id: 'a', status: 'succeeded' },
            { id: 'b', status: 'pending' },
        ])).toBe('b');
    });

    it('prefers the newest running task when several are open', () => {
        expect(pendingPollTaskId([
            { id: 'a', status: 'pending' },
            { id: 'b', status: 'processing' },
        ])).toBe('a');
    });

    it('is null when every task has finished', () => {
        expect(pendingPollTaskId([
            { id: 'a', status: 'succeeded' },
            { id: 'b', status: 'failed' },
        ])).toBeNull();
    });

    it('is null with no tasks at all', () => {
        expect(pendingPollTaskId([])).toBeNull();
    });
});
