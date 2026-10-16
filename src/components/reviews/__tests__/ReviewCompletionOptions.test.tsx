import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { ReviewCompletionOptions } from '../ReviewCompletionOptions';
import type { ReviewCompletionControls } from '../useReviewCompletion';
import type { Readiness } from '@/lib/documents/readiness';
import enReviews from '../../../../messages/en/reviews.json';

function controls(readiness: Readiness, timezone = 'Europe/Athens'): ReviewCompletionControls {
    return {
        state: {
            transcriptRecipients: [],
            automaticDocuments: [{ document: 'minutes', recipientEmails: ['clerk@example.org', 'cc@example.org'], readiness }],
            administrativeBodyName: 'City Council',
            timezone,
            summarizeAvailability: 'succeeded',
            summarizeNotifications: { kind: 'sends' },
        },
        isLoading: false,
        error: null,
        sendTranscript: false,
        setSendTranscript: jest.fn(),
        runSummarize: false,
        setRunSummarize: jest.fn(),
        reload: jest.fn(),
        completionOptions: { sendTranscript: false, runSummarize: false },
    };
}

function renderOptions(completion: ReviewCompletionControls) {
    return render(
        <NextIntlClientProvider locale="en" messages={{ reviews: enReviews } as AbstractIntlMessages}>
            <ReviewCompletionOptions completion={completion} />
        </NextIntlClientProvider>,
    );
}

describe('ReviewCompletionOptions — the minutes line', () => {
    it.each([
        [{ state: 'complete' }, 'The minutes go to clerk@example.org now: every subject has its decision.'],
        [{ state: 'incomplete', missingSubjectIds: ['s1', 's2'] }, 'The provisional minutes go to clerk@example.org now: 2 subjects have no decision yet.'],
        [{ state: 'wait', reason: 'summarize', dueAt: null }, 'The minutes go to clerk@example.org once the summary of the meeting is ready.'],
        [{ state: 'wait', reason: 'poll', dueAt: null }, 'The minutes go to clerk@example.org after one more check for their decisions on Diavgeia.'],
        [{ state: 'wait', reason: 'agenda', dueAt: null }, 'The minutes go to clerk@example.org once the subjects of the meeting are recorded.'],
    ] as Array<[Readiness, string]>)('tells the reviewer: %j', (readiness, text) => {
        renderOptions(controls(readiness));
        expect(screen.getByText(text)).toBeInTheDocument();
    });

    it('dates the threshold in the timezone of the meeting\'s city', () => {
        // 22:00 UTC on 14 Mar is 15 Mar in Athens, and still 14 Mar in Montréal
        const dueAt = new Date('2026-03-14T22:00:00Z');
        const { unmount } = renderOptions(controls({ state: 'wait', reason: 'decisions', dueAt }));
        expect(screen.getByText(/at the latest on/).textContent).toMatch(/March 15, 2026/);
        unmount();
        renderOptions(controls({ state: 'wait', reason: 'decisions', dueAt }, 'America/Toronto'));
        expect(screen.getByText(/at the latest on/).textContent).toMatch(/March 14, 2026/);
    });
});
