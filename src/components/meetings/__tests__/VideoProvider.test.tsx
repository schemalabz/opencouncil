import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VideoProvider, useVideo } from '../VideoProvider';
import { useCouncilMeetingData } from '../CouncilMeetingDataContext';
import * as OptionsContext from '../options/OptionsContext';
import { CouncilMeeting } from '@prisma/client';

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// Mock the context to avoid importing Prisma and DB utilities causing env.mjs parse errors in Jest
jest.mock('../CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: jest.fn()
}));

// Mock MuxVideo to prevent console errors about it
jest.mock('@mux/mux-player-react', () => ({
    __esModule: true,
    default: (props: React.VideoHTMLAttributes<HTMLVideoElement>) => <video {...props} data-testid="mock-video" />
}));

const mockMeeting = {
    id: 'test-meeting',
    cityId: 'test-city',
    dateTime: new Date(),
    title: 'Test Meeting',
    videoUrl: 'https://example.com/video.mp4',
    videoDuration: 3600,
    status: 'PUBLISHED',
    createdAt: new Date(),
    updatedAt: new Date(),
    dateString: '2021-01-01',
    youtubeId: null,
    youtubeUrl: null,
    processingError: null,
    processedAt: null,
    isProcessing: false,
    transcriptionUrl: null,
    summaryUrl: null,
    views: 0
} as unknown as CouncilMeeting;

const TestConsumer = () => {
    const { scrollToUtterance } = useVideo();
    return (
        <div>
            <button onClick={() => scrollToUtterance(5)} data-testid="scroll-to-5">Scroll to 5s</button>
            <button onClick={() => scrollToUtterance(15)} data-testid="scroll-to-15">Scroll to 15s</button>
        </div>
    );
};

const SeekConsumer = () => {
    const { currentTime, seekTo } = useVideo();
    return (
        <div>
            <span data-testid="current-time">{currentTime}</span>
            <button onClick={() => seekTo(42)} data-testid="seek-to-42">Seek to 42s</button>
        </div>
    );
};

describe('VideoProvider', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Setup initial mocks
        jest.spyOn(OptionsContext, 'useTranscriptOptions').mockReturnValue({
            options: { playbackSpeed: 1, editable: true, canCreateHighlights: true, editsAllowed: true, selectedSpeakerTag: null, highlightLowConfidenceWords: true, maxUtteranceDrift: 500, skipInterval: 5 },
            updateOptions: jest.fn()
        } as unknown as ReturnType<typeof OptionsContext.useTranscriptOptions>);
    });

    it('dynamically consumes transcript from context and scrolls to newly added utterances', () => {
        let transcriptData = [
            {
                id: 'segment-1',
                utterances: [
                    { id: 'utt-1', startTimestamp: 0, endTimestamp: 10, text: 'Hello' }
                ]
            }
        ];

        (useCouncilMeetingData as jest.Mock).mockImplementation(() => ({
            transcript: transcriptData,
            meeting: { meeting: mockMeeting },
            getHighlight: jest.fn(),
            taskStatus: { humanReview: true }
        }));

        const { rerender } = render(
            <VideoProvider meeting={mockMeeting}>
                <div id="utt-1" data-testid="utt-1"></div>
                <div id="utt-2" data-testid="utt-2"></div>
                <TestConsumer />
            </VideoProvider>
        );

        const mockScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

        // Action: Click button to scroll to 5s (should find utt-1)
        fireEvent.click(screen.getByTestId('scroll-to-5'));

        expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
        // The element should be the one with id 'utt-1'
        // We can't easily check which element scrollIntoView was called on with just jest.fn() natively
        // unless we mock it specifically on the element itself, but we can verify it was called.
        // Let's attach a specific mock to the DOM elements:
        const utt1 = document.getElementById('utt-1');
        const utt2 = document.getElementById('utt-2');
        utt1!.scrollIntoView = jest.fn();
        utt2!.scrollIntoView = jest.fn();

        fireEvent.click(screen.getByTestId('scroll-to-5'));
        expect(utt1!.scrollIntoView).toHaveBeenCalledTimes(1);
        expect(utt2!.scrollIntoView).not.toHaveBeenCalled();

        // Now update the dynamic data simulating a new utterance added
        transcriptData = [
            {
                id: 'segment-1',
                utterances: [
                    { id: 'utt-1', startTimestamp: 0, endTimestamp: 10, text: 'Hello' },
                    { id: 'utt-2', startTimestamp: 10, endTimestamp: 20, text: 'World' } // New utterance
                ]
            }
        ];

        // Rerender to trigger the new context values
        rerender(
            <VideoProvider meeting={mockMeeting}>
                <div id="utt-1" data-testid="utt-1"></div>
                <div id="utt-2" data-testid="utt-2"></div>
                <TestConsumer />
            </VideoProvider>
        );

        const utt2AfterRerender = document.getElementById('utt-2');
        expect(utt2AfterRerender).not.toBeNull();
        utt2AfterRerender!.scrollIntoView = jest.fn();

        // Action: Click button to scroll to 15s (should find utt-2)
        fireEvent.click(screen.getByTestId('scroll-to-15'));

        // Verify utt2 received the scrollIntoView call because VideoProvider 
        // dynamically picked up the new utterance
        expect(utt2AfterRerender!.scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('updates currentTime in context immediately when seekTo is called', () => {
        const mockedUseCouncilMeetingData = useCouncilMeetingData as jest.Mock;
        mockedUseCouncilMeetingData.mockReturnValue({
            transcript: [
                {
                    id: 'segment-1',
                    utterances: [{ id: 'utt-1', startTimestamp: 0, endTimestamp: 10, text: 'Hello' }]
                }
            ],
            meeting: { meeting: mockMeeting }
        });

        render(
            <VideoProvider meeting={mockMeeting}>
                <SeekConsumer />
            </VideoProvider>
        );

        expect(screen.getByTestId('current-time')).toHaveTextContent('0');
        fireEvent.click(screen.getByTestId('seek-to-42'));
        expect(screen.getByTestId('current-time')).toHaveTextContent('42');
    });
});
