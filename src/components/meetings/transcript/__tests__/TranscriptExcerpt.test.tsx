import { webcrypto } from 'crypto';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import Transcript from '@/components/meetings/transcript/Transcript';
import { TranscriptOptionsProvider, useTranscriptOptions } from '@/components/meetings/options/OptionsContext';
import { useExcerptHighlighted } from '@/components/sharing/ExcerptRangeHighlight';
import { digestExcerpt, serializeExcerptSelector, type ExcerptSource } from '@/lib/sharing/excerptSelector';

let mockQuery = new URLSearchParams();
const mockSources: ExcerptSource[] = [0, 100, 0, 100].map((drift, index) => ({
    id: `u${index + 1}`, text: `Utterance ${index + 1}`, drift,
    speakerTagId: 'speaker', personId: null, speakerName: null, startTimestamp: index,
}));
const mockSegments = [{ id: 'segment', startTimestamp: 0, endTimestamp: 4 }];
const mockSetScroll = jest.fn();

jest.mock('next/navigation', () => ({ useSearchParams: () => mockQuery }));
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/components/meetings/VideoProvider', () => ({ useVideo: () => ({ setCurrentScrollInterval: mockSetScroll }) }));
jest.mock('@/components/meetings/HighlightContext', () => ({ useHighlight: () => ({ editingHighlight: null }) }));
jest.mock('@/components/meetings/CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({ transcript: mockSegments, taskStatus: { humanReview: true }, meeting: { released: true } }),
}));
jest.mock('@/lib/utils', () => ({ debounce: (fn: unknown) => fn, joinTranscriptSegments: (segments: unknown) => segments }));
jest.mock('@/components/sharing/ExcerptSelectionToolbar', () => ({
    useExcerptSources: () => mockSources, ExcerptSelectionToolbar: () => null,
}));
jest.mock('@/components/meetings/transcript/UtteranceContextMenu', () => ({
    UtteranceContextMenu: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@/components/meetings/transcript/UnverifiedTranscriptBanner', () => ({ BANNER_HEIGHT_FULL: 0 }));
jest.mock('@/components/meetings/transcript/SpeakerSegment', () => ({
    __esModule: true,
    default: () => <>{mockSources.map(source => <SourceProbe key={source.id} source={source} />)}<OptionsProbe /></>,
}));

function SourceProbe({ source }: { source: ExcerptSource }) {
    const highlighted = useExcerptHighlighted(source.id);
    return <span data-utterance-id={source.id}>{highlighted ? <mark>{source.text}</mark> : source.text}</span>;
}

function OptionsProbe() {
    const { options } = useTranscriptOptions();
    return <output aria-label="Transcript filter">{options.maxUtteranceDrift}</output>;
}

function Fixture() {
    return <TranscriptOptionsProvider editable={false} canCreateHighlights={false}><Transcript /></TranscriptOptionsProvider>;
}

describe('excerpt filter isolation', () => {
    beforeAll(() => {
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
        Object.defineProperty(globalThis, 'IntersectionObserver', {
            configurable: true,
            value: jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() })),
        });
        HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    it('scopes a strict filter to the highlighted excerpt and preserves transcript options after navigation', async () => {
        mockQuery = serializeExcerptSelector({
            cityId: 'city', meetingId: 'meeting', firstUtteranceId: 'u1', lastUtteranceId: 'u3',
            textLocale: 'en', maxDrift: 0, digest: await digestExcerpt([mockSources[0], mockSources[2]]),
        });
        const { container, rerender } = render(<Fixture />);
        await waitFor(() => expect(container.querySelectorAll('mark')).toHaveLength(2));
        expect(screen.getByText('Utterance 2').tagName).toBe('SPAN');
        expect(screen.getByText('Utterance 4').tagName).toBe('SPAN');
        expect(screen.getByLabelText('Transcript filter')).toHaveTextContent('500');

        mockQuery = new URLSearchParams();
        rerender(<Fixture />);
        await waitFor(() => expect(container.querySelectorAll('mark')).toHaveLength(0));
        expect(screen.getByLabelText('Transcript filter')).toHaveTextContent('500');
    });
});
