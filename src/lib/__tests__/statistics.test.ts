import {
  getStatisticsFor,
  getStatisticsForTranscript,
  getBatchStatisticsForSubjects,
  Statistics,
  Stat
} from '../statistics';
import prisma from '../db/prisma';

// Mock prisma
jest.mock('../db/prisma', () => ({
  __esModule: true,
  default: {
    utterance: {
      findMany: jest.fn()
    },
    councilMeeting: {
      findUnique: jest.fn()
    },
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
              roles: [],
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

      (prisma.councilMeeting.findUnique as jest.Mock).mockResolvedValue({ dateTime: new Date() });
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue(mockSegments);

      await getStatisticsFor({ meetingId: 'meeting-1', cityId: 'city-1' }, ['person', 'party', 'topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            meetingId: 'meeting-1',
            cityId: 'city-1',
            meeting: expect.objectContaining({
              released: true
            }),
            NOT: {
              summary: {
                type: "procedural"
              }
            }
          }),
          include: expect.objectContaining({
            speakerTag: expect.any(Object),
            topicLabels: expect.any(Object)
          })
        })
      );
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

      // Note: Party filtering is done in application code after the query,
      // not in the database query itself (see lines 141-148 in statistics.ts)
      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          speakerTag: {
            personId: undefined
          }
        })
      }));
    });

    it('should call prisma with correct parameters for subject statistics', async () => {
      (prisma.utterance.findMany as jest.Mock).mockResolvedValue([
        {
          speakerSegmentId: 'segment-1',
          startTimestamp: 0,
          endTimestamp: 30
        }
      ]);
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ subjectId: 'subject-1' }, ['person', 'party', 'topic']);

      // Verify utterances tagged with the subject were used
      expect(prisma.utterance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            discussionSubjectId: 'subject-1',
            discussionStatus: 'SUBJECT_DISCUSSION'
          }
        })
      );

      // Verify speaker segments were queried with filtered IDs
      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['segment-1'] }
          })
        })
      );
    });

    it('should return empty statistics when the subject has no tagged utterances', async () => {
      (prisma.utterance.findMany as jest.Mock).mockResolvedValue([]);

      const stats = await getStatisticsFor({ subjectId: 'subject-1' }, ['person', 'party', 'topic']);

      expect(stats.speakingSeconds).toBe(0);
      expect(prisma.speakerSegment.findMany).not.toHaveBeenCalled();
    });

    it('should call prisma with correct parameters for administrative body statistics', async () => {
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([]);

      await getStatisticsFor({ administrativeBodyId: 'admin-body-1' }, ['person', 'party', 'topic']);

      expect(prisma.speakerSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          meeting: expect.objectContaining({
            released: true,
            administrativeBodyId: 'admin-body-1'
          })
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
          id: 'segment-1',
          startTimestamp: 0,
          endTimestamp: 50,
          speakerTag: {
            person: {
              id: 'person-1',
              roles: [
                {
                  id: 'role-1',
                  partyId: 'party-1',
                  party: {
                    id: 'party-1',
                    name: 'Party A'
                  },
                  startDate: new Date('2020-01-01'),
                  endDate: null
                }
              ]
            }
          },
          topicLabels: []
        },
        {
          id: 'segment-2',
          startTimestamp: 50,
          endTimestamp: 70,
          speakerTag: {
            person: {
              id: 'person-2',
              roles: [
                {
                  id: 'role-2',
                  partyId: 'party-1',
                  party: {
                    id: 'party-1',
                    name: 'Party A'
                  },
                  startDate: new Date('2020-01-01'),
                  endDate: null
                }
              ]
            }
          },
          topicLabels: []
        },
        {
          id: 'segment-3',
          startTimestamp: 70,
          endTimestamp: 100,
          speakerTag: {
            person: {
              id: 'person-3',
              roles: [
                {
                  id: 'role-3',
                  partyId: 'party-2',
                  party: {
                    id: 'party-2',
                    name: 'Party B'
                  },
                  startDate: new Date('2020-01-01'),
                  endDate: null
                }
              ]
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
      expect(partyAStats!.speakingSeconds).toBe(70); // 50 + 20

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
  describe('discussion time comes from tagged utterances, not whole segments', () => {
    // A subject's time is the sum of its tagged utterances. Reading the segment length instead
    // overstates it, because a segment carries whatever else that speaker said in it.
    const seg = (id: string, start: number, end: number, personId: string) => ({
      id,
      startTimestamp: start,
      endTimestamp: end,
      speakerTag: { person: { id: personId, name: personId, roles: [] } },
      topicLabels: []
    });

    it('uses the tagged duration instead of the full segment duration', async () => {
      const transcript = [seg('seg-1', 0, 100, 'person-1')] as any;

      const stats = await getStatisticsForTranscript(
        transcript,
        ['person'],
        undefined,
        new Map([['seg-1', 30]])
      );

      expect(stats.speakingSeconds).toBe(30);
      expect(stats.people!.find(p => p.item.id === 'person-1')!.speakingSeconds).toBe(30);
    });

    it('counts a segment with no tagged utterance as zero, not as its full length', async () => {
      const transcript = [
        seg('seg-1', 0, 100, 'person-1'),
        seg('seg-2', 100, 260, 'person-2')
      ] as any;

      const stats = await getStatisticsForTranscript(
        transcript,
        ['person'],
        undefined,
        new Map([['seg-1', 30]])
      );

      expect(stats.speakingSeconds).toBe(30);
      expect(stats.people!.find(p => p.item.id === 'person-2')!.speakingSeconds).toBe(0);
    });

    it('sums the tagged utterances of a segment instead of the segment length', async () => {
      (prisma.utterance.findMany as jest.Mock).mockResolvedValue([
        { speakerSegmentId: 'seg-1', startTimestamp: 10, endTimestamp: 25 },
        { speakerSegmentId: 'seg-1', startTimestamp: 40, endTimestamp: 45 },
        { speakerSegmentId: 'seg-2', startTimestamp: 200, endTimestamp: 209 }
      ]);
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([
        seg('seg-1', 0, 100, 'person-1'),
        seg('seg-2', 100, 300, 'person-2')
      ]);

      const stats = await getStatisticsFor({ subjectId: 'subject-1' }, ['person']);

      // seg-1 gives 15 + 5, seg-2 gives 9. The segments themselves are 100 and 200 long.
      expect(stats.speakingSeconds).toBe(29);
      expect(stats.people!.find(p => p.item.id === 'person-1')!.speakingSeconds).toBe(20);
      expect(stats.people!.find(p => p.item.id === 'person-2')!.speakingSeconds).toBe(9);
    });

    it('gives each subject only its own tagged time when they share a segment', async () => {
      (prisma.utterance.findMany as jest.Mock).mockResolvedValue([
        { discussionSubjectId: 'a', speakerSegmentId: 'seg-1', startTimestamp: 0, endTimestamp: 10 },
        { discussionSubjectId: 'a', speakerSegmentId: 'seg-1', startTimestamp: 20, endTimestamp: 25 },
        { discussionSubjectId: 'b', speakerSegmentId: 'seg-1', startTimestamp: 30, endTimestamp: 33 }
      ]);
      (prisma.speakerSegment.findMany as jest.Mock).mockResolvedValue([
        seg('seg-1', 0, 500, 'person-1')
      ]);

      const result = await getBatchStatisticsForSubjects(['a', 'b', 'c']);

      expect(result.get('a')!.speakingSeconds).toBe(15);
      expect(result.get('b')!.speakingSeconds).toBe(3);
      expect(result.get('c')!.speakingSeconds).toBe(0);
    });
  });
});
