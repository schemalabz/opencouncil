/** @jest-environment node */
jest.mock('@/env.mjs', () => ({
    env: {
        NEXTAUTH_SECRET: 'test-secret',
        NEXTAUTH_URL: 'https://opencouncil.gr',
        ANTHROPIC_API_KEY: 'test-key',
    },
}));

jest.mock('@/lib/ai', () => ({
    aiChat: jest.fn(),
}));

import { isUnsubscribeMessage, verifyUnsubscribeIntent } from '../unsubscribe';
import { aiChat } from '@/lib/ai';

const mockAiChat = aiChat as jest.MockedFunction<typeof aiChat>;

describe('isUnsubscribeMessage', () => {
    describe('nullish or empty input', () => {
        it.each([
            ['null', null],
            ['undefined', undefined],
            ['empty string', ''],
        ])('returns false for %s', (_label, input) => {
            expect(isUnsubscribeMessage(input)).toBe(false);
        });
    });

    describe('English keywords', () => {
        it('matches STOP as a standalone word', () => {
            expect(isUnsubscribeMessage('STOP')).toBe(true);
        });

        it('matches stop case-insensitively', () => {
            expect(isUnsubscribeMessage('stop')).toBe(true);
            expect(isUnsubscribeMessage('Stop')).toBe(true);
        });

        it('matches stop with surrounding text (word boundary)', () => {
            expect(isUnsubscribeMessage('please stop sending me messages')).toBe(true);
        });

        it('does not match stop substrings without a word boundary', () => {
            expect(isUnsubscribeMessage('stopped')).toBe(false);
            expect(isUnsubscribeMessage('nonstop')).toBe(false);
        });

        it('matches unsubscribe as a standalone word', () => {
            expect(isUnsubscribeMessage('unsubscribe')).toBe(true);
            expect(isUnsubscribeMessage('UNSUBSCRIBE')).toBe(true);
            expect(isUnsubscribeMessage('please unsubscribe me')).toBe(true);
        });

        it('does not match unsubscribe substrings without a word boundary', () => {
            expect(isUnsubscribeMessage('unsubscribed')).toBe(false);
            expect(isUnsubscribeMessage('unsubscribing')).toBe(false);
        });
    });

    describe('Greek keywords', () => {
        it('matches ΣΤΟΠ case-insensitively', () => {
            expect(isUnsubscribeMessage('ΣΤΟΠ')).toBe(true);
            expect(isUnsubscribeMessage('στοπ')).toBe(true);
        });

        it('matches διακοπή', () => {
            expect(isUnsubscribeMessage('διακοπή')).toBe(true);
        });

        it('matches απεγγραφή (full form)', () => {
            expect(isUnsubscribeMessage('απεγγραφή')).toBe(true);
        });

        it('matches απεγγραφ (stem) so accent-less variants still trigger', () => {
            expect(isUnsubscribeMessage('απεγγραφ')).toBe(true);
        });

        it('matches inside surrounding Greek text', () => {
            expect(isUnsubscribeMessage('παρακαλώ διακοπή των ειδοποιήσεων')).toBe(true);
        });

        it('matches imperative verb form "απεγγράψτε" (φ→ψ aorist shift)', () => {
            // Greek shifts φ→ψ in the aorist consonant cluster, so the
            // imperative stem is `απεγγραψ-` not `απεγγραφ-`. The regex
            // character class `απεγγρα[φψ]` covers both.
            expect(isUnsubscribeMessage('Απεγγραψτε με')).toBe(true);
            expect(isUnsubscribeMessage('Απεγγράψτε με')).toBe(true);
            expect(isUnsubscribeMessage('απεγγράψω από όλα')).toBe(true);
        });
    });

    describe('ambiguous matches (regex catches widely / LLM filters intent)', () => {
        // Regex casts a wide net deliberately; verifyUnsubscribeIntent below
        // is the safety net that rejects these. Documented here so the
        // two-layer architecture is explicit.

        it('matches "stop" as a verb in conversational text', () => {
            expect(isUnsubscribeMessage('I want to stop the meeting')).toBe(true);
            expect(isUnsubscribeMessage('θα stop περάσω αύριο')).toBe(true);
        });

        it('matches "στοπ" used as a noun (e.g. road sign)', () => {
            expect(isUnsubscribeMessage('Το στοπ διπλα απο το σπιτι μου εχει πεσει')).toBe(true);
        });

        it('matches "απεγγραφ-" stem in a past-tense self-reference (after diacritic stripping)', () => {
            expect(isUnsubscribeMessage('Απεγγράφτηκα προχτες και θέλω να ξαναεγγραφώ')).toBe(true);
        });
    });

    describe('non-matching text', () => {
        it.each([
            'hello',
            'this is fine',
            'please send me more information',
            '   ',
        ])('returns false for %j', (input) => {
            expect(isUnsubscribeMessage(input)).toBe(false);
        });
    });
});

describe('verifyUnsubscribeIntent', () => {
    beforeEach(() => {
        mockAiChat.mockReset();
    });

    // Helper: build the resolved value the Anthropic client returns from
    // aiChat<T>. The wrapper only reads `result.unsubscribe`.
    const mockVerdict = (unsubscribe: boolean, reasoning = '') => {
        mockAiChat.mockResolvedValueOnce({
            result: { unsubscribe, reasoning },
        } as Awaited<ReturnType<typeof aiChat>>);
    };

    it('returns "confirmed" when the LLM votes unsubscribe=true', async () => {
        mockVerdict(true);
        await expect(verifyUnsubscribeIntent('STOP')).resolves.toBe('confirmed');
    });

    it('returns "rejected" when the LLM votes unsubscribe=false', async () => {
        mockVerdict(false);
        await expect(verifyUnsubscribeIntent('I want to stop the meeting')).resolves.toBe('rejected');
    });

    it('returns "failed" when the LLM call throws', async () => {
        // The function deliberately logs to console.error in its catch block;
        // silence it here so the expected outage doesn't look like a real
        // failure in test output. Also asserts the log fires (defence
        // against silent swallowing).
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        try {
            mockAiChat.mockRejectedValueOnce(new Error('LLM outage'));
            await expect(verifyUnsubscribeIntent('STOP')).resolves.toBe('failed');
            expect(errorSpy).toHaveBeenCalledWith(
                'verifyUnsubscribeIntent failed:',
                expect.any(Error),
            );
        } finally {
            errorSpy.mockRestore();
        }
    });

    // Greek false positives — the regex catches the keyword but the user's
    // intent is clearly not opt-out. The prompt has explicit examples for
    // both; here we verify the wrapper propagates the LLM's `false` verdict
    // correctly. The LLM behaviour itself (does the prompt actually reject
    // these?) is validated separately by manual/integration testing.
    describe('Greek ambiguous matches', () => {
        it('propagates "rejected" for "Το στοπ διπλα..." (road sign)', async () => {
            mockVerdict(false, 'reference to a stop sign, not an opt-out');
            await expect(
                verifyUnsubscribeIntent('Το στοπ διπλα απο το σπιτι μου εχει πεσει'),
            ).resolves.toBe('rejected');
        });

        it('propagates "rejected" for "Απεγγράφτηκα προχτές..." (past narration)', async () => {
            mockVerdict(false, 'past-tense narration, user asks to re-subscribe');
            await expect(
                verifyUnsubscribeIntent('Απεγγράφτηκα προχτες και θέλω να ξαναεγγραφώ'),
            ).resolves.toBe('rejected');
        });
    });
});
