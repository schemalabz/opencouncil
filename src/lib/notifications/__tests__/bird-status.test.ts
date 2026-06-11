/** @jest-environment node */
import { mapBirdMessageStatus } from '../bird-status';

describe('mapBirdMessageStatus', () => {
    describe('delivered statuses', () => {
        it.each(['delivered', 'read', 'DELIVERED', 'Read'])(
            'maps %j to "delivered"',
            (input) => {
                expect(mapBirdMessageStatus(input)).toBe('delivered');
            },
        );
    });

    describe('failed statuses', () => {
        it.each([
            'rejected',
            'failed',
            'sending_failed',
            'delivery_failed',
            'REJECTED',
            'Sending_Failed',
        ])('maps %j to "failed"', (input) => {
            expect(mapBirdMessageStatus(input)).toBe('failed');
        });

        it('matches any status string containing "failed"', () => {
            // The `.includes('failed')` check catches future Bird variants.
            expect(mapBirdMessageStatus('some_new_failed_variant')).toBe('failed');
        });
    });

    describe('pending statuses', () => {
        it.each(['pending', 'queued', 'PENDING', 'Queued'])(
            'maps %j to "pending"',
            (input) => {
                expect(mapBirdMessageStatus(input)).toBe('pending');
            },
        );
    });

    describe('fallback to "sent"', () => {
        it.each([
            ['known sent status', 'sent'],
            ['accepted', 'accepted'],
            ['unrecognized string', 'some_unknown_value'],
            ['empty string', ''],
        ])('returns "sent" for %s (%j)', (_label, input) => {
            expect(mapBirdMessageStatus(input)).toBe('sent');
        });

        it('returns "sent" for undefined', () => {
            expect(mapBirdMessageStatus(undefined)).toBe('sent');
        });
    });

    describe('priority ordering', () => {
        it('treats "delivery_failed" as failed, not delivered', () => {
            // The "failed" branch is checked before the substring of
            // "delivered" would matter — guard against future refactors
            // reordering the conditions and silently flipping behaviour.
            expect(mapBirdMessageStatus('delivery_failed')).toBe('failed');
        });
    });
});
