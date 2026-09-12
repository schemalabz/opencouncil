import posthog from 'posthog-js';
import { captureSharingEvent, type SharingContext } from '../sharing';

jest.mock('posthog-js', () => ({ __loaded: true, capture: jest.fn() }));
const context: SharingContext = { content_type: 'excerpt', surface: 'transcript_selection', city_id: 'city', meeting_id: 'meeting', reviewed: false, editable: true, utterance_count: 2 };
beforeEach(() => { jest.clearAllMocks(); posthog.__loaded = true; });

it('sends structured sharing events through the existing PostHog capture helper', () => {
    captureSharingEvent('sharing_action_succeeded', context, { action: 'copy_link' });
    expect(posthog.capture).toHaveBeenCalledWith('sharing_action_succeeded', expect.objectContaining({ ...context, action: 'copy_link' }));
});

it('respects the existing disabled-analytics guard', () => {
    posthog.__loaded = false;
    captureSharingEvent('sharing_opened', context);
    expect(posthog.capture).not.toHaveBeenCalled();
});

it('does not include source text, speaker names, URLs or raw errors', () => {
    const extraContext = { ...context, text: 'sensitive transcript', speakerName: 'Speaker name', url: 'https://example.test/private' };
    const extraDetails = { action: 'copy_text' as const, error: 'raw exception with source' };
    captureSharingEvent('sharing_action_failed', extraContext, extraDetails);
    const data = JSON.stringify((posthog.capture as jest.Mock).mock.calls);
    for (const forbidden of ['sensitive transcript', 'Speaker name', 'https://example.test/private', 'raw exception with source']) expect(data).not.toContain(forbidden);
});
