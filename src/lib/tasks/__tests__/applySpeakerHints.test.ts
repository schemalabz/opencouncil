/** @jest-environment node */

const mockTaskFindUnique = jest.fn();
const mockTaskFindMany = jest.fn();
const mockTagFindMany = jest.fn();
const mockTagUpdateMany = jest.fn();
const mockPersonFindMany = jest.fn();

jest.mock('server-only', () => ({}));
jest.mock('../../db/prisma', () => ({
  __esModule: true,
  default: {
    taskStatus: {
      findUnique: (...args: unknown[]) => mockTaskFindUnique(...args),
      findMany: (...args: unknown[]) => mockTaskFindMany(...args),
    },
    speakerTag: {
      findMany: (...args: unknown[]) => mockTagFindMany(...args),
      updateMany: (...args: unknown[]) => mockTagUpdateMany(...args),
    },
    person: { findMany: (...args: unknown[]) => mockPersonFindMany(...args) },
  },
}));

import { applySpeakerHints } from '../speakerHints';

type Tag = {
  id: string;
  label: string | null;
  personId: string | null;
  personSetBy: 'voiceprint' | 'transcript' | 'both' | 'user' | null;
  voiceprintPersonId: string | null;
  transcriptPersonId: string | null;
  transcriptConfidence: number | null;
};

const tag = (id: string, over: Partial<Tag> = {}): Tag => ({
  id, label: 'Άγνωστος Ομιλητής 1', personId: null, personSetBy: null, voiceprintPersonId: null, transcriptPersonId: null, transcriptConfidence: null, ...over,
});
const voiceprintTag = (id: string, personId: string) => tag(id, { label: 'SPEAKER_7', personId, personSetBy: 'voiceprint', voiceprintPersonId: personId });
const hint = (speakerTagId: string, personId: string, confidence = 95) => ({ speakerTagId, personId, confidence, evidence: 'e' });

const AUTOMATIC = {
  OR: [{ personSetBy: { in: ['voiceprint', 'transcript', 'both'] } }, { personSetBy: null, personId: null }],
};

const TASK_CREATED = new Date('2026-09-18T10:10:00Z');
const at = (time: string) => new Date(`2026-09-18T${time}:00Z`);
type Run = { type: 'transcribe' | 'fixTranscript' | 'humanReview'; createdAt: Date };
const TRANSCRIBED: Run = { type: 'transcribe', createdAt: at('10:00') };
const THIS_RUN: Run = { type: 'fixTranscript', createdAt: TASK_CREATED };

function setup(tags: Tag[], { people = ['anna', 'babis'], reviewed = false, runs }: { people?: string[]; reviewed?: boolean; runs?: Run[] } = {}) {
  mockTaskFindUnique.mockResolvedValue({ cityId: 'city-1', councilMeetingId: 'meeting-1', createdAt: TASK_CREATED });
  mockTagFindMany.mockResolvedValue(tags);
  mockPersonFindMany.mockResolvedValue(people.map(id => ({ id })));
  mockTaskFindMany.mockResolvedValue(runs ?? [TRANSCRIBED, THIS_RUN, ...(reviewed ? [{ type: 'humanReview' as const, createdAt: at('12:00') }] : [])]);
  mockTagUpdateMany.mockResolvedValue({ count: 1 });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('applySpeakerHints', () => {
  it('reads the tags, people and review of the task\'s own meeting', async () => {
    setup([]);
    await applySpeakerHints('task-1', [hint('t1', 'anna')]);

    expect(mockTagFindMany.mock.calls[0][0].where).toEqual({ speakerSegments: { some: { cityId: 'city-1', meetingId: 'meeting-1' } } });
    expect(mockPersonFindMany.mock.calls[0][0].where).toEqual({ cityId: 'city-1', id: { in: ['anna'] } });
    expect(mockTaskFindMany.mock.calls[0][0].where).toEqual({ cityId: 'city-1', councilMeetingId: 'meeting-1', status: 'succeeded', type: { in: ['transcribe', 'fixTranscript', 'humanReview'] } });
  });

  it('assigns a confident transcript hint to an untouched tag, guarding the write', async () => {
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [hint('t1', 'anna', 90)]);

    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { transcriptPersonId: 'anna', transcriptConfidence: 90, personId: 'anna', personSetBy: 'transcript' },
    });
  });

  it('stores an unsure transcript hint without assigning it', async () => {
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [hint('t1', 'anna', 60)]);

    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1' }, data: { transcriptPersonId: 'anna', transcriptConfidence: 60 } });
  });

  it('marks agreement with the voiceprint match', async () => {
    setup([voiceprintTag('t1', 'anna')]);
    await applySpeakerHints('task-1', [hint('t1', 'anna')]);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { transcriptPersonId: 'anna', transcriptConfidence: 95, personId: 'anna', personSetBy: 'both' },
    });
  });

  it('assigns nobody on a confident disagreement, and shows readers an unknown speaker', async () => {
    setup([voiceprintTag('t1', 'anna'), tag('t2', { label: 'Άγνωστος Ομιλητής 4' })]);
    await applySpeakerHints('task-1', [hint('t1', 'babis')]);

    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      // The numbering continues after the meeting's highest unknown speaker.
      data: { transcriptPersonId: 'babis', transcriptConfidence: 95, personId: null, personSetBy: null, label: 'Άγνωστος Ομιλητής 5' },
    });
  });

  it('keeps the voiceprint match against an unsure guess, and stores the guess', async () => {
    setup([voiceprintTag('t1', 'anna')]);
    await applySpeakerHints('task-1', [hint('t1', 'babis', 60)]);

    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1' }, data: { transcriptPersonId: 'babis', transcriptConfidence: 60 } });
  });

  it('never changes a reviewer\'s tag, and still stores the hint', async () => {
    setup([
      tag('chosen', { personId: 'babis', personSetBy: 'user' }),
      tag('cleared', { personSetBy: 'user' }),
      tag('legacy', { personId: 'babis' }),
    ]);
    await applySpeakerHints('task-1', [hint('chosen', 'anna'), hint('cleared', 'anna'), hint('legacy', 'anna')]);

    expect(mockTagUpdateMany).toHaveBeenCalledTimes(3);
    for (const id of ['chosen', 'cleared', 'legacy']) {
      expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id }, data: { transcriptPersonId: 'anna', transcriptConfidence: 95 } });
    }
  });

  it('protects a tag with no recorded source even when no reviewer has touched the meeting', async () => {
    setup([tag('legacy', { personId: 'babis' })]);
    await applySpeakerHints('task-1', [hint('legacy', 'anna')]);

    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 'legacy' }, data: { transcriptPersonId: 'anna', transcriptConfidence: 95 } });
  });

  it('changes no assignment once a reviewer has started on the meeting\'s speakers', async () => {
    // The reviewer left the voiceprint name alone — which is how a reviewer confirms it.
    setup([tag('decided', { personId: 'babis', personSetBy: 'user' }), voiceprintTag('confirmed', 'anna'), tag('open')]);
    await applySpeakerHints('task-1', [hint('confirmed', 'babis'), hint('open', 'anna')]);

    for (const call of mockTagUpdateMany.mock.calls) {
      expect(Object.keys(call[0].data).sort()).toEqual(['transcriptConfidence', 'transcriptPersonId']);
    }
    expect(mockTagUpdateMany).toHaveBeenCalledTimes(2);
  });

  it('ignores a result that a later transcribe or fixTranscript run supersedes', async () => {
    const stale = [tag('t1', { personId: 'anna', personSetBy: 'transcript', transcriptPersonId: 'anna', transcriptConfidence: 90 })];

    setup(stale, { runs: [TRANSCRIBED, THIS_RUN, { type: 'transcribe', createdAt: at('11:00') }] });
    await applySpeakerHints('task-1', []);
    setup(stale, { runs: [TRANSCRIBED, THIS_RUN, { type: 'fixTranscript', createdAt: at('11:00') }] });
    await applySpeakerHints('task-1', [hint('gone', 'babis')]);

    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('does not let a review of an earlier transcript freeze a re-transcribed meeting', async () => {
    const retranscribed: Run[] = [{ type: 'transcribe', createdAt: at('08:00') }, { type: 'humanReview', createdAt: at('09:00') }, TRANSCRIBED, THIS_RUN];
    setup([tag('t1')], { runs: retranscribed });
    await applySpeakerHints('task-1', [hint('t1', 'anna', 90)]);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { transcriptPersonId: 'anna', transcriptConfidence: 90, personId: 'anna', personSetBy: 'transcript' },
    });
  });

  it('stores the hint only when a reviewer takes the tag while hints are applied', async () => {
    setup([tag('t1')]);
    mockTagUpdateMany.mockResolvedValueOnce({ count: 0 });
    await applySpeakerHints('task-1', [hint('t1', 'anna')]);

    expect(mockTagUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockTagUpdateMany).toHaveBeenLastCalledWith({ where: { id: 't1' }, data: { transcriptPersonId: 'anna', transcriptConfidence: 95 } });
  });

  it('changes no assignment once human review is complete', async () => {
    setup([tag('t1'), voiceprintTag('t2', 'anna')], { reviewed: true });
    await applySpeakerHints('task-1', [hint('t1', 'anna'), hint('t2', 'anna')]);

    expect(mockTagUpdateMany).toHaveBeenCalledTimes(2);
    for (const call of mockTagUpdateMany.mock.calls) {
      expect(Object.keys(call[0].data).sort()).toEqual(['transcriptConfidence', 'transcriptPersonId']);
    }
  });

  it('takes back what an earlier run gave a tag the new result does not name', async () => {
    setup([tag('t1', { personId: 'anna', personSetBy: 'transcript', transcriptPersonId: 'anna', transcriptConfidence: 90 })]);
    await applySpeakerHints('task-1', []);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { transcriptPersonId: null, transcriptConfidence: null, personId: null, personSetBy: null },
    });
  });

  it('writes nothing when a rerun says the same thing', async () => {
    setup([
      tag('t1', { personId: 'anna', personSetBy: 'transcript', transcriptPersonId: 'anna', transcriptConfidence: 90 }),
      voiceprintTag('t2', 'babis'),
      tag('t3'),
    ]);
    await applySpeakerHints('task-1', [hint('t1', 'anna', 90)]);

    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('drops hints for a person outside the city and for a tag outside the meeting', async () => {
    setup([tag('t1')], { people: [] });
    await applySpeakerHints('task-1', [hint('t1', 'stranger'), hint('gone', 'anna')]);

    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('fails loudly when the task is unknown', async () => {
    setup([]);
    mockTaskFindUnique.mockResolvedValue(null);
    await expect(applySpeakerHints('nope', [])).rejects.toThrow('Task not found');
  });
});
