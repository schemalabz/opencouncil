/** @jest-environment node */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MeetingData } from '@/lib/getMeetingData';

const passthrough = ({ children }: { children: React.ReactNode }) => children;

jest.mock('../VideoProvider', () => ({ VideoProvider: passthrough }));
jest.mock('../options/OptionsContext', () => ({ TranscriptOptionsProvider: passthrough }));
jest.mock('../CouncilMeetingDataContext', () => ({ CouncilMeetingDataProvider: passthrough }));
jest.mock('../HighlightContext', () => ({ HighlightProvider: passthrough }));
jest.mock('../subject/UtteranceExpansionContext', () => ({ UtteranceExpansionProvider: passthrough }));
jest.mock('@/contexts/KeyboardShortcutsContext', () => ({ KeyboardShortcutsProvider: passthrough }));
jest.mock('../EditingContext', () => ({ EditingProvider: passthrough }));
jest.mock('../KeyboardShortcuts', () => ({ KeyboardShortcuts: () => null }));
// The bar's providers read the (mocked) meeting data context, and the mode
// provider pulls next-intl, which jest does not transform.
jest.mock('../bar/BarDataContext', () => ({ BarDataProvider: passthrough }));
jest.mock('../bar/BarHighlightContext', () => ({ BarHighlightProvider: passthrough }));
jest.mock('../bar/PlaybackBar', () => ({ BarModeProvider: passthrough }));

import CouncilMeetingWrapper from '../CouncilMeetingWrapper';

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
