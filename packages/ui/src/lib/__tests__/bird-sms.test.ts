import { birdSmsPayload, readBirdSmsReceipt, redactPhones } from '../bird-sms';

describe('readBirdSmsReceipt', () => {
    it('reads a send off the message id', () => {
        expect(readBirdSmsReceipt(202, { id: 'm1', status: 'accepted' })).toEqual({ sent: true, messageId: 'm1' });
    });

    it('names Bird\'s code and message on a refusal, and never the raw body', () => {
        const refused = readBirdSmsReceipt(422, {
            code: 'InvalidReceiver',
            message: 'the receiver is not a mobile number',
            details: { identifierValue: '+306900000001' },
        });
        expect(refused).toEqual({
            sent: false,
            reason: 'HTTP 422: InvalidReceiver — the receiver is not a mobile number',
            retryable: false,
        });
        expect(readBirdSmsReceipt(503, null)).toEqual({ sent: false, reason: 'HTTP 503', retryable: true });
        expect(readBirdSmsReceipt(400, { title: 'Bad Request' })).toMatchObject({ reason: 'HTTP 400: Bad Request' });
    });

    it('hides a number that Bird echoes in its message', () => {
        expect(readBirdSmsReceipt(422, { message: 'receiver +30 694 347 2297 is blocked' })).toMatchObject({
            reason: 'HTTP 422: receiver [number] is blocked',
        });
        expect(readBirdSmsReceipt(200, { id: 'm1', status: 'failed', detail: '00306943472297 unreachable' })).toMatchObject({
            reason: '[number] unreachable',
        });
        expect(redactPhones('code 482913 expired')).toBe('code 482913 expired');
    });

    it('treats a 2xx without a message id, or with a failure status, as not sent', () => {
        expect(readBirdSmsReceipt(200, null)).toMatchObject({ sent: false, retryable: false });
        expect(readBirdSmsReceipt(200, { id: 'm1', status: 'rejected', detail: 'blocked destination' })).toEqual({
            sent: false,
            reason: 'blocked destination',
            retryable: false,
        });
    });

    it('builds the channels-API payload', () => {
        expect(birdSmsPayload('+306900000001', 'γεια')).toEqual({
            receiver: { contacts: [{ identifierValue: '+306900000001' }] },
            body: { type: 'text', text: { text: 'γεια' } },
        });
    });
});
