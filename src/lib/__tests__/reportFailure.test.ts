/** @jest-environment node */
// The three new callers (transcription start, pasted agenda, auto-release)
// mock reportFailure, so nothing checks that it alerts or that the failure
// of the alert stays inside it.
const mockSendErrorAdminAlert = jest.fn();
jest.mock('server-only', () => ({}));
jest.mock('@/lib/discord-core', () => ({ sendErrorAdminAlert: (...args: unknown[]) => mockSendErrorAdminAlert(...args) }));

import { reportFailure } from '@/lib/reportFailure';

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reportFailure', () => {
    it('alerts the operators with the source, the message of the error and the context', () => {
        mockSendErrorAdminAlert.mockResolvedValue(undefined);
        reportFailure('Unattended release', 'Failed to release chania/m1', new Error('database down'), { cityId: 'chania', meetingId: 'm1' });
        expect(mockSendErrorAdminAlert).toHaveBeenCalledWith({ source: 'Unattended release', error: 'database down', context: { cityId: 'chania', meetingId: 'm1' } });
    });

    it('keeps the failure of the alert inside: the caller goes on, and nothing is left unhandled', async () => {
        const unhandled = jest.fn();
        process.on('unhandledRejection', unhandled);
        mockSendErrorAdminAlert.mockRejectedValue(new Error('Discord down'));
        expect(() => reportFailure('Pasted agenda', 'Failed', 'not an Error', { cityId: 'chania' })).not.toThrow();
        await new Promise(resolve => setImmediate(resolve));
        process.off('unhandledRejection', unhandled);
        expect(unhandled).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith('Failed to send the Pasted agenda alert:', expect.any(Error));
    });
});
