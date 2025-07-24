import {
  getStatisticsFor,
  getStatisticsForTranscript,
  Statistics,
  Stat
} from '../statistics';
import prisma from '../db/prisma';

// Mock prisma
jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: {
    speakerSegment: {
      findMany: jest.fn()
    }
  }
}));

describe('Statistics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStatisticsFor', () => {
    it('should call prisma with correct parameters for meeting statistics', async () => {
      // Mock data setup
      const mockSegments = [
        {
          id: 'segment-1',
          startTimestamp: 0,
          endTimestamp: 30,
          speakerTag: {
            person: {
              id: 'person-1',
              name: 'John Doe',
              role: 'Mayor',
              party: {
                id: 'party-1',
                name: 'Party A'
              }
            }
          },
          topicLabels: [
            {
              topic: {
                id: 'topic-1',
                name: 'Environment'
              }
            }
          ]
        }
      ];

      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue(mockSegments);

      await getStatisticsFor({ meetingId: 'meeting-1', cityId: 'city-1' }, ['person', 'party', 'topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith({
        where: {
          meetingId: 'meeting-1',
          cityId: 'city-1',
          speakerTag: {
            personId: undefined,
            person: undefined
          },
          subjects: undefined
        },
        include: expect.objectContaining({
          speakerTag: expect.any(Object),
          topicLabels: expect.any(Object)
        })
      });
    });

    it('should call prisma with correct parameters for person statistics', async () => {
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ personId: 'person-1' }, ['topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          speakerTag: expect.objectContaining({
            personId: 'person-1'
          })
        })
      }));
    });

    it('should call prisma with correct parameters for party statistics', async () => {
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ partyId: 'party-1' }, ['person', 'topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          speakerTag: expect.objectContaining({
            person: {
              partyId: 'party-1'
            }
          })
        })
      }));
    });

    it('should call prisma with correct parameters for subject statistics', async () => {
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ subjectId: 'subject-1' }, ['person', 'party', 'topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          subjects: {
            some: {
              subjectId: 'subject-1'
            }
          }
        })
      }));
    });

    it('should call prisma with correct parameters for administrative body statistics', async () => {
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ administrativeBodyId: 'admin-body-1' }, ['person', 'party', 'topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          meeting: {
            administrativeBodyId: 'admin-body-1'
          }
        })
      }));
    });
  });

  describe('getStatisticsForTranscript', () => {
    it('should calculate total speaking seconds correctly', async () => {
      const transcript = [
        {
          startTimestamp: 0,
          endTimestamp: 30,
          speakerTag: { person: null },
          topicLabels: []
        },
        {
          startTimestamp: 30,
          endTimestamp: 60,
          speakerTag: { person: null },
          topicLabels: []
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, []);

      expect(stats.speakingSeconds).toBe(60);
    });

    it('should handle negative or zero duration segments', async () => {
      const transcript = [
        {
          startTimestamp: 10,
          endTimestamp: 5, // Negative duration
          speakerTag: { person: null },
          topicLabels: []
        },
        {
          startTimestamp: 20,
          endTimestamp: 20, // Zero duration
          speakerTag: { person: null },
          topicLabels: []
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, []);

      expect(stats.speakingSeconds).toBe(0);
    });

    it('should group statistics by person correctly', async () => {
      const transcript = [
        {
          startTimestamp: 0,
          endTimestamp: 30,
          speakerTag: {
            person: {
              id: 'person-1',
              name: 'John Doe'
            }
          },
          topicLabels: []
        },
        {
          startTimestamp: 30,
          endTimestamp: 60,
          speakerTag: {
            person: {
              id: 'person-1',
              name: 'John Doe'
            }
          },
          topicLabels: []
        },
        {
          startTimestamp: 60,
          endTimestamp: 100,
          speakerTag: {
            person: {
              id: 'person-2',
              name: 'Jane Smith'
            }
          },
          topicLabels: []
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, ['person']);

      expect(stats.people).toBeDefined();
      expect(stats.people!.length).toBe(2);

      const johnStats = stats.people!.find(p => p.item.id === 'person-1');
      expect(johnStats).toBeDefined();
      expect(johnStats!.speakingSeconds).toBe(60); // 30 + 30
      expect(johnStats!.count).toBe(2);

      const janeStats = stats.people!.find(p => p.item.id === 'person-2');
      expect(janeStats).toBeDefined();
      expect(janeStats!.speakingSeconds).toBe(40); // 100 - 60
      expect(janeStats!.count).toBe(1);
    });

    it('should group statistics by party correctly', async () => {
      const transcript = [
        {
          startTimestamp: 0,
          endTimestamp: 50,
          speakerTag: {
            person: {
              id: 'person-1',
              party: {
                id: 'party-1',
                name: 'Party A'
              }
            }
          },
          topicLabels: []
        },
        {
          startTimestamp: 50,
          endTimestamp: 70,
          speakerTag: {
            person: {
              id: 'person-2',
              party: {
                id: 'party-1',
                name: 'Party A'
              }
            }
          },
          topicLabels: []
        },
        {
          startTimestamp: 70,
          endTimestamp: 100,
          speakerTag: {
            person: {
              id: 'person-3',
              party: {
                id: 'party-2',
                name: 'Party B'
              }
            }
          },
          topicLabels: []
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, ['party']);

      expect(stats.parties).toBeDefined();
      expect(stats.parties!.length).toBe(2);

      const partyAStats = stats.parties!.find(p => p.item.id === 'party-1');
      expect(partyAStats).toBeDefined();
      expect(partyAStats!.speakingSeconds).toBe(50); // Only non-administrative role time (50)

      const partyBStats = stats.parties!.find(p => p.item.id === 'party-2');
      expect(partyBStats).toBeDefined();
      expect(partyBStats!.speakingSeconds).toBe(30); // 100 - 70
    });

    it('should distribute time evenly among multiple topics', async () => {
      const transcript = [
        {
          startTimestamp: 0,
          endTimestamp: 60,
          speakerTag: { person: null },
          topicLabels: [
            {
              topic: {
                id: 'topic-1',
                name: 'Environment'
              }
            },
            {
              topic: {
                id: 'topic-2',
                name: 'Transportation'
              }
            }
          ]
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, ['topic']);

      expect(stats.topics).toBeDefined();
      expect(stats.topics!.length).toBe(2);

      const topic1Stats = stats.topics!.find(t => t.item.id === 'topic-1');
      const topic2Stats = stats.topics!.find(t => t.item.id === 'topic-2');

      expect(topic1Stats!.speakingSeconds).toBe(30); // 60 / 2
      expect(topic2Stats!.speakingSeconds).toBe(30); // 60 / 2
    });

    it('should handle segments without persons or topics', async () => {
      const transcript = [
        {
          startTimestamp: 0,
          endTimestamp: 30,
          speakerTag: { person: null }, // No person
          topicLabels: []
        },
        {
          startTimestamp: 30,
          endTimestamp: 60,
          speakerTag: {
            person: {
              id: 'person-1',
              name: 'John Doe',
              party: null // No party
            }
          },
          topicLabels: [] // No topics
        }
      ] as any;

      const stats = await getStatisticsForTranscript(transcript, ['person', 'party', 'topic']);

      expect(stats.speakingSeconds).toBe(60);
      expect(stats.people!.length).toBe(1);
      expect(stats.parties!.length).toBe(0);
      expect(stats.topics!.length).toBe(0);
    });
  });
});