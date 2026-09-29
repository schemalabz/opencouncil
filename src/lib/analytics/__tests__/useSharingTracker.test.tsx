import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { captureEvent } from '@/lib/analytics/capture';
import { useSharingTracker, type SharingContext } from '../sharing';

jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
const analytics: SharingContext = { content_type: 'excerpt', surface: 'transcript_selection', city_id: 'city', meeting_id: 'meeting' };

// Callers pass inline context objects, and effects such as the Story panel's
// once-only event and image fetch are keyed on the tracker.
function OpenedOnce({ context }: { context: SharingContext }) {
    const track = useSharingTracker(context);
    useEffect(() => { track('sharing_story_opened'); }, [track]);
    return null;
}

it('keeps one tracker for equal contexts and a new one for a changed context', () => {
    const { rerender } = render(<OpenedOnce context={analytics} />);
    rerender(<OpenedOnce context={{ ...analytics }} />);
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith('sharing_story_opened', expect.objectContaining(analytics));
    rerender(<OpenedOnce context={{ ...analytics, surface: 'transcript_segment' }} />);
    expect(captureEvent).toHaveBeenCalledTimes(2);
});
