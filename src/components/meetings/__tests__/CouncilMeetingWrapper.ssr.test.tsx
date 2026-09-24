/** @jest-environment node */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MeetingData } from '@/lib/getMeetingData';

const passthrough = ({ children }: { children: React.ReactNode }) => children;

jest.mock('@/components/meetings/VideoProvider', () => ({ VideoProvider: passthrough }));
jest.mock('@/components/meetings/options/OptionsContext', () => ({ TranscriptOptionsProvider: passthrough }));
jest.mock('@/components/meetings/CouncilMeetingDataContext', () => ({ CouncilMeetingDataProvider: passthrough }));
jest.mock('@/components/meetings/HighlightContext', () => ({ HighlightProvider: passthrough }));
jest.mock('@/components/meetings/subject/UtteranceExpansionContext', () => ({ UtteranceExpansionProvider: passthrough }));
jest.mock('@/contexts/KeyboardShortcutsContext', () => ({ KeyboardShortcutsProvider: passthrough }));
jest.mock('@/components/meetings/EditingContext', () => ({ EditingProvider: passthrough }));
jest.mock('@/components/meetings/KeyboardShortcuts', () => ({ KeyboardShortcuts: () => null }));
// The bar's providers read the (mocked) meeting data context, and the mode
// provider pulls next-intl, which jest does not transform.
jest.mock('@/components/meetings/bar/BarDataContext', () => ({ BarDataProvider: passthrough }));
jest.mock('@/components/meetings/bar/BarHighlightContext', () => ({ BarHighlightProvider: passthrough }));
jest.mock('@/components/meetings/bar/PlaybackBar', () => ({ BarModeProvider: passthrough }));

import CouncilMeetingWrapper from '@/components/meetings/CouncilMeetingWrapper';

describe('CouncilMeetingWrapper server rendering', () => {
    it('renders the existing page content before client effects run', () => {
        const meetingData = {
            meeting: { id: 'meeting-1' },
            transcript: [],
        } as unknown as MeetingData;

        const html = renderToStaticMarkup(
            <CouncilMeetingWrapper
                meetingData={meetingData}
                editable={false}
                canCreateHighlights={false}
            >
                <main>Existing meeting page</main>
            </CouncilMeetingWrapper>
        );

        expect(html).toContain('<main>Existing meeting page</main>');
        expect(html).not.toContain('animate-spin');
    });
});
