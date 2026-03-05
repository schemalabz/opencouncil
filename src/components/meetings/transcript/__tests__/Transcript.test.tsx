import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import Transcript from '../Transcript';
import { useCouncilMeetingData } from '../../CouncilMeetingDataContext';
import { useTranscriptOptions } from '../../options/OptionsContext';
import { useVideo } from '../../VideoProvider';
import { useHighlight } from '../../HighlightContext';
import { Transcript as TranscriptType } from '@/lib/db/transcript';

jest.mock('../SpeakerSegment', () => ({
    __esModule: true,
    default: ({ segment }: { segment: { id: string } }) => <div data-testid={`segment-${segment.id}`}>{segment.id}</div>
}));

jest.mock('../UnverifiedTranscriptBanner', () => ({
    __esModule: true,
    BANNER_HEIGHT_FULL: 0,
    UnverifiedTranscriptBanner: () => null
}));

jest.mock('../../CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: jest.fn()
}));

jest.mock('../../options/OptionsContext', () => ({
    useTranscriptOptions: jest.fn()
}));

jest.mock('../../VideoProvider', () => ({
    useVideo: jest.fn()
}));

jest.mock('../../HighlightContext', () => ({
    useHighlight: jest.fn()
}));

jest.mock('next/navigation', () => ({
    useSearchParams: () => ({
        get: () => null
    })
}));

const makeSegment = (id: string, startTimestamp: number, endTimestamp: number): TranscriptType[number] => ({
    id,
    startTimestamp,
    endTimestamp,
    speakerTagId: `tag-${id}`,
    utterances: [],
    speakerTag: { id: `tag-${id}`, label: 'Speaker', personId: null, createdAt: new Date(), updatedAt: new Date() },
    topicLabels: [],
    summary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    meetingId: 'meeting',
    cityId: 'city'
});

describe('Transcript', () => {
    let transcriptData: TranscriptType = [];

    beforeAll(() => {
        class MockIntersectionObserver {
            observe() { }
            unobserve() { }
            disconnect() { }
        }

        Object.defineProperty(window, 'IntersectionObserver', {
            writable: true,
            value: MockIntersectionObserver
        });
    });

    beforeEach(() => {
        transcriptData = [
            makeSegment('seg-a', 10, 20),
            makeSegment('seg-b', 20, 30)
        ];

        (useCouncilMeetingData as jest.Mock).mockImplementation(() => ({
            transcript: transcriptData,
            getHighlight: jest.fn(),
            taskStatus: { humanReview: true }
        }));

        (useTranscriptOptions as jest.Mock).mockReturnValue({
            options: { editable: true }
        });

        (useVideo as jest.Mock).mockReturnValue({
            setCurrentScrollInterval: jest.fn(),
            currentTime: 0
        });

        (useHighlight as jest.Mock).mockReturnValue({
            enterEditMode: jest.fn()
        });
    });

    it('uses stable DOM ids based on segment ids across transcript insertions', () => {
        const { rerender } = render(<Transcript />);

        expect(document.getElementById('speaker-segment-seg-a')).toBeInTheDocument();
        expect(document.getElementById('speaker-segment-seg-b')).toBeInTheDocument();

        transcriptData = [
            makeSegment('seg-new', 5, 9),
            ...transcriptData
        ];

        rerender(<Transcript />);

        expect(document.getElementById('speaker-segment-seg-new')).toBeInTheDocument();
        expect(document.getElementById('speaker-segment-seg-a')).toBeInTheDocument();
        expect(document.getElementById('speaker-segment-seg-b')).toBeInTheDocument();
        expect(document.getElementById('speaker-segment-0')).not.toBeInTheDocument();
    });
});
