import { SpeakerTag, Utterance } from '@prisma/client';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import SpeakerSegment from '../SpeakerSegment';

const mockUpdateSpeakerTagPerson = jest.fn();
const mockUpdateSpeakerTagLabel = jest.fn();
const mockPushAction = jest.fn();
const mockToast = jest.fn();

const speakerTag: SpeakerTag = {
    id: 'tag-1',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    label: 'Άγνωστος Ομιλητής 1',
    personId: null
};

const utterance: Utterance = {
    id: 'utterance-1',
    startTimestamp: 10,
    endTimestamp: 12,
    text: 'Κείμενο',
    drift: 0,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    speakerSegmentId: 'segment-1',
    uncertain: false,
    lastModifiedBy: null,
    discussionStatus: null,
    discussionSubjectId: null
};

const segment: TranscriptType[number] = {
    id: 'segment-1',
    startTimestamp: 10,
    endTimestamp: 12,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    meetingId: 'meeting-1',
    cityId: 'city-1',
    speakerTagId: speakerTag.id,
    speakerTag,
    utterances: [utterance],
    topicLabels: [],
    summary: null
};

jest.mock('../../CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({
        getPerson: () => undefined,
        getSpeakerTag: () => speakerTag,
        getSpeakerSegmentCount: () => 1,
        people: [],
        speakerTags: [speakerTag],
        updateSpeakerTagPerson: mockUpdateSpeakerTagPerson,
        updateSpeakerTagLabel: mockUpdateSpeakerTagLabel,
        deleteEmptySegment: jest.fn(),
        addUtteranceToSegment: jest.fn(),
        createEmptySegmentAfter: jest.fn(),
        createEmptySegmentBefore: jest.fn()
    })
}));

jest.mock('../../VideoProvider', () => ({
    useVideo: () => ({
        currentTime: 0
    })
}));

jest.mock('../../EditingContext', () => ({
    useEditing: () => ({
        pushAction: mockPushAction
    })
}));

jest.mock('../../options/OptionsContext', () => ({
    useTranscriptOptions: () => ({
        options: {
            editable: true
        }
    })
}));

jest.mock('../Utterance', () => ({
    __esModule: true,
    default: () => null
}));

jest.mock('../Topic', () => ({
    __esModule: true,
    default: () => null
}));

jest.mock('../SpeakerSegmentMetadataDialog', () => ({
    __esModule: true,
    default: () => null
}));

jest.mock('@/components/AIGeneratedBadge', () => ({
    AIGeneratedBadge: () => null
}));

jest.mock('@/components/persons/PersonBadge', () => ({
    PersonBadge: ({
        onPersonChange,
        onLabelChange
    }: {
        onPersonChange?: (personId: string | null) => void;
        onLabelChange?: (label: string) => void;
    }) => (
        <div>
            <button onClick={() => onPersonChange?.('person-2')}>assign-person</button>
            <button onClick={() => onLabelChange?.('Νέα ετικέτα')}>set-label</button>
        </div>
    )
}));

jest.mock('next-auth/react', () => ({
    useSession: () => ({
        data: {
            user: {
                isSuperAdmin: false
            }
        }
    })
}));

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key
}));

jest.mock('@/hooks/use-toast', () => ({
    useToast: () => ({
        toast: mockToast
    })
}));

jest.mock('@/hooks/use-media-query', () => ({
    useMediaQuery: () => false
}));

import { TooltipProvider } from '@/components/ui/tooltip';

describe('SpeakerSegment history registration', () => {
    beforeEach(() => {
        mockUpdateSpeakerTagPerson.mockReset();
        mockUpdateSpeakerTagLabel.mockReset();
        mockPushAction.mockReset();
        mockToast.mockReset();

        mockUpdateSpeakerTagPerson.mockResolvedValue(undefined);
        mockUpdateSpeakerTagLabel.mockResolvedValue(undefined);
    });

    it('registers undo/redo history for speaker assignment changes', async () => {
        render(
            <TooltipProvider>
                <SpeakerSegment
                    segment={segment}
                    renderMock={false}
                    isFirstSegment
                />
            </TooltipProvider>
        );


        fireEvent.click(screen.getByRole('button', { name: 'assign-person' }));

        await waitFor(() => {
            expect(mockUpdateSpeakerTagPerson).toHaveBeenCalledWith('tag-1', 'person-2');
        });

        expect(mockPushAction).toHaveBeenCalledTimes(1);
        expect(mockPushAction).toHaveBeenCalledWith({
            type: 'SPEAKER_ASSIGNMENT',
            payload: {
                speakerTagId: 'tag-1',
                previousPersonId: null,
                nextPersonId: 'person-2'
            }
        });
    });

    it('registers undo/redo history for speaker label changes', async () => {
        render(
            <TooltipProvider>
                <SpeakerSegment
                    segment={segment}
                    renderMock={false}
                    isFirstSegment
                />
            </TooltipProvider>
        );


        fireEvent.click(screen.getByRole('button', { name: 'set-label' }));

        await waitFor(() => {
            expect(mockUpdateSpeakerTagLabel).toHaveBeenCalledWith('tag-1', 'Νέα ετικέτα');
        });

        expect(mockPushAction).toHaveBeenCalledTimes(1);
        expect(mockPushAction).toHaveBeenCalledWith({
            type: 'SPEAKER_LABEL',
            payload: {
                speakerTagId: 'tag-1',
                previousLabel: 'Άγνωστος Ομιλητής 1',
                nextLabel: 'Νέα ετικέτα'
            }
        });
    });
});
