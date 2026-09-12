import { fireEvent, render, screen } from '@testing-library/react';
import { captureEvent } from '@/lib/analytics/capture';
import { SharingViewTracker, SharingSourceLink } from '../SharingTracker';

jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));
const analytics = { content_type: 'excerpt' as const, surface: 'shared_excerpt', city_id: 'city', meeting_id: 'meeting' };

it('records a recipient once per content view and the source action separately', () => {
    const { rerender } = render(<SharingViewTracker analytics={analytics} />);
    rerender(<SharingViewTracker analytics={{ ...analytics }} />);
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith('sharing_received', expect.objectContaining(analytics));
    render(<SharingSourceLink analytics={analytics} action="open_transcript" href="#transcript">Read the source</SharingSourceLink>);
    fireEvent.click(screen.getByRole('link'));
    expect(captureEvent).toHaveBeenLastCalledWith('sharing_source_opened', expect.objectContaining({ ...analytics, action: 'open_transcript' }));
});
