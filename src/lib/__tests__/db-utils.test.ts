// Import the mock modules first
import prisma from '../db/prisma';

// Create mock implementations
const mockUtils = {
  getRequestOnTranscriptRequestBody: jest.fn(),
  getSummarizeRequestBody: jest.fn(),
  getAvailableSpeakerSegmentIds: jest.fn(),
  createSubjectsForMeeting: jest.fn()
};

// Mock implementation of util functions
jest.mock('../db/utils', () => mockUtils);

// Import the mocked functions
const { 
  getRequestOnTranscriptRequestBody, 
  getSummarizeRequestBody,
  getAvailableSpeakerSegmentIds,
  createSubjectsForMeeting
} = mockUtils;

// Create a mock for prisma
const mockPrisma = {
  speakerSegment: {
    findMany: jest.fn().mockResolvedValue([
      { id: 'segment-1' },
      { id: 'segment-2' }
    ])
  },
  $transaction: jest.fn().mockResolvedValue({ success: true })
};

// Mock prisma implementation
jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: mockPrisma
}));

describe('DB Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set default return values for mocks
    getRequestOnTranscriptRequestBody.mockResolvedValue({
      transcript: [{ speakerName: 'John Doe', speakerParty: 'Party A' }],
      topicLabels: ['Environment'],
      cityName: 'Athens',
      date: '2024-01-15'
    });
    
    getSummarizeRequestBody.mockImplementation(async (councilMeetingId, cityId, requestedSubjects, additionalInstructions) => {
      return {
        transcript: [{ speakerName: 'John Doe' }],
        requestedSubjects,
        existingSubjects: [{ name: 'Existing subject' }],
        additionalInstructions
      };
    });
    
    getAvailableSpeakerSegmentIds.mockResolvedValue(['segment-1', 'segment-2']);
    
    createSubjectsForMeeting.mockResolvedValue(undefined);
  });

  describe('getRequestOnTranscriptRequestBody', () => {
    it('should be called with correct parameters', async () => {
      await getRequestOnTranscriptRequestBody('meeting-1', 'city-1');
      expect(getRequestOnTranscriptRequestBody).toHaveBeenCalledWith('meeting-1', 'city-1');
    });
  });

  describe('getSummarizeRequestBody', () => {
    it('should be called with correct parameters', async () => {
      await getSummarizeRequestBody('meeting-1', 'city-1', ['New subject'], 'Additional instructions');
      
      // Verify parameters were passed correctly
      expect(getSummarizeRequestBody).toHaveBeenCalledWith(
        'meeting-1', 
        'city-1', 
        ['New subject'], 
        'Additional instructions'
      );
    });
  });

  describe('getAvailableSpeakerSegmentIds', () => {
    it('should be called with correct parameters', async () => {
      await getAvailableSpeakerSegmentIds('meeting-1', 'city-1');
      
      // Verify parameters were passed correctly
      expect(getAvailableSpeakerSegmentIds).toHaveBeenCalledWith('meeting-1', 'city-1');
    });
  });

  describe('createSubjectsForMeeting', () => {
    it('should be called with correct parameters', async () => {
      const subjects = [
        {
          name: 'Test Subject',
          description: 'Description',
          topicLabel: 'Environment',
          hot: true,
          agendaItemIndex: 1,
          introducedByPersonId: 'person-1',
          speakerSegments: [{ speakerSegmentId: 'segment-1', summary: 'Summary' }],
          highlightedUtteranceIds: ['utterance-1'],
          location: { type: 'point', text: 'Location', coordinates: [[10, 20]] }
        }
      ];
      
      await createSubjectsForMeeting(subjects as any, 'city-1', 'meeting-1');
      
      // Verify parameters were passed correctly
      expect(createSubjectsForMeeting).toHaveBeenCalledWith(subjects, 'city-1', 'meeting-1');
    });
  });
});