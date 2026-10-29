/** @jest-environment node */

const mockTaskFindUnique = jest.fn();
const mockTaskFindMany = jest.fn();
const mockTagFindMany = jest.fn();
const mockTagUpdateMany = jest.fn();
const mockPersonFindMany = jest.fn();
const mockIdentificationUpsert = jest.fn();
const mockIdentificationDeleteMany = jest.fn();

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
    speakerIdentification: {
      upsert: (...args: unknown[]) => mockIdentificationUpsert(...args),
      deleteMany: (...args: unknown[]) => mockIdentificationDeleteMany(...args),
    },
    person: { findMany: (...args: unknown[]) => mockPersonFindMany(...args) },
  },
}));

import { applySpeakerHints, automaticAssignmentWhere, isPlaceholderLabel } from '../speakerHints';
import { isReviewerAssignment } from '@/lib/speakerIdentifications';
import type { SpeakerHint, UnlistedSpeakerHint } from '@/lib/apiTypes';

type Identification = {
  method: 'voiceprint' | 'transcript';
  personId: string | null;
  name: string | null;
  actionable: boolean;
  evidenceKind: string | null;
  confidence: number | null;
  evidence: string | null;
};
type Tag = {
  id: string;
  label: string | null;
  personId: string | null;
  personSetBy: 'voiceprint' | 'transcript' | 'both' | 'user' | null;
  identifications: Identification[];
};

const tag = (id: string, over: Partial<Tag> = {}): Tag => ({
  id, label: 'Άγνωστος Ομιλητής 1', personId: null, personSetBy: null, identifications: [], ...over,
});
const matched = (personId: string): Identification => ({ method: 'voiceprint', personId, name: null, actionable: true, evidenceKind: null, confidence: 90, evidence: null });
const voiceprintTag = (id: string, personId: string) => tag(id, { label: 'SPEAKER_7', personId, personSetBy: 'voiceprint', identifications: [matched(personId)] });

/** A name the task would act on by itself. */
const hint = (speakerTagId: string, personId: string, over: Partial<SpeakerHint> = {}): SpeakerHint =>
  ({ speakerTagId, personId, actionable: true, evidenceKind: 'named', confidence: 95, evidence: 'e', ...over });
/** A name the task returns as a suggestion only. */
const tentative = (speakerTagId: string, personId: string) =>
  hint(speakerTagId, personId, { actionable: false, evidenceKind: 'roleBehaviour', confidence: 60 });

/** A label for a speaker who is not on the roster, that the task would act on by itself. */
const unlistedHint = (speakerTagId: string, name: string, over: Partial<UnlistedSpeakerHint> = {}): UnlistedSpeakerHint =>
  ({ speakerTagId, name, actionable: true, evidenceKind: 'named', confidence: 90, evidence: 'e', ...over });
/** A label the task returns as a suggestion only. */
const tentativeUnlisted = (speakerTagId: string, name: string) =>
  unlistedHint(speakerTagId, name, { actionable: false, evidenceKind: 'addressed', confidence: 60 });

/** What a hint is stored as. */
const asStored = ({ speakerTagId: _tag, ...given }: SpeakerHint | UnlistedSpeakerHint): Identification => ({
  method: 'transcript',
  personId: 'personId' in given ? given.personId : null,
  name: 'name' in given ? given.name : null,
  actionable: given.actionable,
  evidenceKind: given.evidenceKind,
  confidence: given.confidence,
  evidence: given.evidence,
});
const stored = (hint: SpeakerHint | UnlistedSpeakerHint) => {
  const { method: _method, ...given } = asStored(hint);
  return {
    where: { speakerTagId_method: { speakerTagId: hint.speakerTagId, method: 'transcript' } },
    create: { speakerTagId: hint.speakerTagId, method: 'transcript', ...given },
    update: given,
  };
};

const AUTOMATIC = automaticAssignmentWhere;

/** Whether a tag satisfies the guard, read the way Postgres reads it: `in` never matches NULL. */
type GuardBranch = { personSetBy: { in: string[] } | null; personId?: string | null };
const guardBranches: GuardBranch[] = automaticAssignmentWhere.OR;
const passesGuard = ({ personId, personSetBy }: Pick<Tag, 'personId' | 'personSetBy'>) =>
  guardBranches.some(branch => {
    const sourceMatches = branch.personSetBy === null
      ? personSetBy === null
      : personSetBy !== null && branch.personSetBy.in.includes(personSetBy);
    return sourceMatches && (branch.personId === undefined || personId === branch.personId);
  });

const at = (time: string) => new Date(`2026-09-18T${time}:00Z`);
type Run = { type: 'transcribe' | 'humanReview'; createdAt: Date };
const TRANSCRIBED: Run = { type: 'transcribe', createdAt: at('10:00') };

function setup(tags: Tag[], { people = ['anna', 'babis'], reviewed = false, runs, realm = 'greece' }: { people?: string[]; reviewed?: boolean; runs?: Run[]; realm?: string } = {}) {
  mockTaskFindUnique.mockResolvedValue({ cityId: 'city-1', councilMeetingId: 'meeting-1', councilMeeting: { city: { realm } } });
  mockTagFindMany.mockResolvedValue(tags);
  mockPersonFindMany.mockResolvedValue(people.map(id => ({ id })));
  mockTaskFindMany.mockResolvedValue(runs ?? [TRANSCRIBED, ...(reviewed ? [{ type: 'humanReview' as const, createdAt: at('12:00') }] : [])]);
  mockTagUpdateMany.mockResolvedValue({ count: 1 });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

describe('automaticAssignmentWhere', () => {
  const sources = [null, 'voiceprint', 'transcript', 'both', 'user'] as const;
  const cases = sources.flatMap(personSetBy => [null, 'anna'].map(personId => ({ personSetBy, personId })));

  it.each(cases)('lets the write through exactly when the tag is not a reviewer\'s: $personSetBy, person $personId', (tag) => {
    expect(passesGuard(tag)).toBe(!isReviewerAssignment(tag));
  });

  it('protects a reviewer\'s tag and an unrecorded person, and leaves the rest open', () => {
    expect(cases.filter(passesGuard)).toEqual([
      { personSetBy: null, personId: null },
      { personSetBy: 'voiceprint', personId: null },
      { personSetBy: 'voiceprint', personId: 'anna' },
      { personSetBy: 'transcript', personId: null },
      { personSetBy: 'transcript', personId: 'anna' },
      { personSetBy: 'both', personId: null },
      { personSetBy: 'both', personId: 'anna' },
    ]);
  });
});

describe('applySpeakerHints', () => {
  it('reads the tags, people and review of the task\'s own meeting', async () => {
    setup([]);
    await applySpeakerHints('task-1', [hint('t1', 'anna')]);

    expect(mockTagFindMany.mock.calls[0][0].where).toEqual({ speakerSegments: { some: { cityId: 'city-1', meetingId: 'meeting-1' } } });
    expect(mockPersonFindMany.mock.calls[0][0].where).toEqual({ cityId: 'city-1', id: { in: ['anna'] } });
    expect(mockTaskFindMany.mock.calls[0][0].where).toEqual({ cityId: 'city-1', councilMeetingId: 'meeting-1', status: 'succeeded', type: { in: ['transcribe', 'humanReview'] } });
  });

  it('stores the transcript identification as given, and assigns a name the task would act on, guarding the write', async () => {
    const given = hint('t1', 'anna', { evidence: '[00:01:14] τον λόγο έχει η κ. Άννα', confidence: 90 });
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [given]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(1);
    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(given));
    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1', ...AUTOMATIC }, data: { personId: 'anna', personSetBy: 'transcript' } });
  });

  it('stores a name the task would not act on, without assigning it', async () => {
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [tentative('t1', 'anna')]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(tentative('t1', 'anna')));
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('compares identities, not scores: a low number on a name the task would act on still assigns', async () => {
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [hint('t1', 'anna', { confidence: 10 })]);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1', ...AUTOMATIC }, data: { personId: 'anna', personSetBy: 'transcript' } });
  });

  it('treats a hint that does not say whether it is actionable as one nobody acts on', async () => {
    const { actionable: _unsaid, ...older } = hint('t1', 'anna');
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [older as SpeakerHint]);

    expect(mockIdentificationUpsert.mock.calls[0][0].create).toMatchObject({ personId: 'anna', actionable: false });
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('marks agreement with the voiceprint match, even on a name the transcript would not act on alone', async () => {
    setup([voiceprintTag('t1', 'anna'), voiceprintTag('t2', 'babis')]);
    await applySpeakerHints('task-1', [hint('t1', 'anna'), tentative('t2', 'babis')]);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1', ...AUTOMATIC }, data: { personId: 'anna', personSetBy: 'both' } });
    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't2', ...AUTOMATIC }, data: { personId: 'babis', personSetBy: 'both' } });
  });

  it('assigns nobody when both methods would act on different people, and shows readers an unknown speaker', async () => {
    setup([voiceprintTag('t1', 'anna'), tag('t2', { label: 'Άγνωστος Ομιλητής 4' })]);
    await applySpeakerHints('task-1', [hint('t1', 'babis')]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(hint('t1', 'babis')));
    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      // The numbering continues after the meeting's highest unknown speaker.
      data: { personId: null, personSetBy: null, label: 'Άγνωστος Ομιλητής 5' },
    });
  });

  it('labels the unknown speaker in the language of the realm, and continues the numbering of the Greek labels', async () => {
    setup([voiceprintTag('t1', 'anna'), tag('t2', { label: 'Άγνωστος Ομιλητής 4' }), tag('t3', { label: 'Unknown Speaker 2' })], { realm: 'poland' });
    await applySpeakerHints('task-1', [hint('t1', 'babis')]);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: null, label: 'Unknown Speaker 5' },
    });
  });

  it('keeps the voiceprint match against a name the transcript would not act on, and stores that name', async () => {
    setup([voiceprintTag('t1', 'anna')]);
    await applySpeakerHints('task-1', [tentative('t1', 'babis')]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(tentative('t1', 'babis')));
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('never changes a reviewer\'s tag, and still stores the identification', async () => {
    setup([
      tag('chosen', { personId: 'babis', personSetBy: 'user' }),
      tag('cleared', { personSetBy: 'user' }),
      tag('legacy', { personId: 'babis' }),
    ]);
    await applySpeakerHints('task-1', [hint('chosen', 'anna'), hint('cleared', 'anna'), hint('legacy', 'anna')]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(3);
    for (const id of ['chosen', 'cleared', 'legacy']) {
      expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(hint(id, 'anna')));
    }
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('protects a tag with no recorded source even when no reviewer has touched the meeting', async () => {
    setup([tag('legacy', { personId: 'babis' })]);
    await applySpeakerHints('task-1', [hint('legacy', 'anna')]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('freezes only the tags a reviewer touched while the review is unfinished', async () => {
    setup([tag('decided', { personId: 'babis', personSetBy: 'user' }), tag('cleared', { personSetBy: 'user' }), tag('open')]);
    await applySpeakerHints('task-1', [hint('decided', 'anna'), hint('cleared', 'anna'), hint('open', 'anna')]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(3);
    // The untouched unknown speaker gets its name, as it would have had the run come before the reviewer.
    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 'open', ...AUTOMATIC }, data: { personId: 'anna', personSetBy: 'transcript' } });
  });

  it('does not let a review of an earlier transcript freeze a re-transcribed meeting', async () => {
    const retranscribed: Run[] = [{ type: 'transcribe', createdAt: at('08:00') }, { type: 'humanReview', createdAt: at('09:00') }, TRANSCRIBED];
    setup([tag('t1')], { runs: retranscribed });
    await applySpeakerHints('task-1', [hint('t1', 'anna')]);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1', ...AUTOMATIC }, data: { personId: 'anna', personSetBy: 'transcript' } });
  });

  it('leaves the tag to a reviewer who takes it while the hints are applied', async () => {
    setup([tag('t1'), tag('t2')]);
    mockTagUpdateMany.mockResolvedValueOnce({ count: 0 });
    await applySpeakerHints('task-1', [hint('t1', 'anna'), hint('t2', 'babis')]);

    // Both opinions are stored; the guarded write on t1 changed nothing, and the run carries on.
    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(2);
    expect(mockTagUpdateMany).toHaveBeenCalledTimes(2);
    expect(mockTagUpdateMany).toHaveBeenLastCalledWith({ where: { id: 't2', ...AUTOMATIC }, data: { personId: 'babis', personSetBy: 'transcript' } });
  });

  it('changes no assignment once human review is complete', async () => {
    setup([tag('t1'), voiceprintTag('t2', 'anna')], { reviewed: true });
    await applySpeakerHints('task-1', [hint('t1', 'anna'), hint('t2', 'anna')]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(2);
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('takes back what an earlier run gave a tag the new result does not name', async () => {
    setup([tag('t1', { personId: 'anna', personSetBy: 'transcript', identifications: [asStored(hint('t1', 'anna'))] })]);
    await applySpeakerHints('task-1', []);

    expect(mockIdentificationDeleteMany).toHaveBeenCalledWith({ where: { speakerTagId: 't1', method: 'transcript' } });
    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1', ...AUTOMATIC }, data: { personId: null, personSetBy: null } });
  });

  it('writes nothing when a rerun says the same thing', async () => {
    setup([
      tag('t1', { personId: 'anna', personSetBy: 'transcript', identifications: [asStored(hint('t1', 'anna'))] }),
      voiceprintTag('t2', 'babis'),
      tag('t3'),
    ]);
    await applySpeakerHints('task-1', [hint('t1', 'anna')]);

    expect(mockIdentificationUpsert).not.toHaveBeenCalled();
    expect(mockIdentificationDeleteMany).not.toHaveBeenCalled();
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('stores the identification again when a rerun names the same person on other evidence', async () => {
    setup([tag('t1', { personId: 'anna', personSetBy: 'transcript', identifications: [asStored(hint('t1', 'anna'))] })]);
    const rerun = hint('t1', 'anna', { evidence: '[00:20:00] κυρία Άννα, έχετε τον λόγο', evidenceKind: 'addressed' });
    await applySpeakerHints('task-1', [rerun]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(rerun));
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('never touches the voiceprint identification', async () => {
    setup([voiceprintTag('t1', 'anna')]);
    await applySpeakerHints('task-1', []);

    expect(mockIdentificationDeleteMany).not.toHaveBeenCalled();
    expect(mockIdentificationUpsert).not.toHaveBeenCalled();
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('drops hints for a person outside the city and for a tag outside the meeting', async () => {
    setup([tag('t1')], { people: [] });
    await applySpeakerHints('task-1', [hint('t1', 'stranger'), hint('gone', 'anna')]);

    expect(mockIdentificationUpsert).not.toHaveBeenCalled();
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('fails loudly when the task is unknown', async () => {
    setup([]);
    mockTaskFindUnique.mockResolvedValue(null);
    await expect(applySpeakerHints('nope', [])).rejects.toThrow('Task not found');
  });
});

describe('isPlaceholderLabel', () => {
  it.each(['', 'SPEAKER_3', 'New speaker segment', 'Άγνωστος Ομιλητής 2', 'Unknown Speaker 4', 'Intervenant inconnu 1'])('names nobody: %s', label => {
    expect(isPlaceholderLabel(label)).toBe(true);
  });
  it('names nobody when there is no label', () => {
    expect(isPlaceholderLabel(null)).toBe(true);
  });
  it.each(['Παπαδόπουλος Γιώργος - κάτοικος', 'Κάτοικος', 'Νέος Δημότης'])('is a name: %s', label => {
    expect(isPlaceholderLabel(label)).toBe(false);
  });
});

describe('applySpeakerHints: speakers who are not on the roster', () => {
  const LABEL = 'Παπαδόπουλος Γιώργος - κάτοικος Χαλέπας';
  /** A tag an earlier run labelled. */
  const labelledTag = (id: string, name = LABEL) =>
    tag(id, { label: name, personSetBy: 'transcript', identifications: [asStored(unlistedHint(id, name))] });

  it('stores the hint without a person, and labels an unknown speaker the task would act on', async () => {
    const given = unlistedHint('t1', LABEL, { evidence: '[00:03:10] τον λόγο έχει ο κ. Παπαδόπουλος' });
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [], [given]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(1);
    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(given));
    expect(mockIdentificationUpsert.mock.calls[0][0].create).toMatchObject({ personId: null, name: LABEL });
    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: 'transcript', label: LABEL },
    });
  });

  it('treats a result without the array as one that names no unlisted speaker', async () => {
    setup([labelledTag('t1')]);
    await applySpeakerHints('task-1', []);

    expect(mockIdentificationDeleteMany).toHaveBeenCalledWith({ where: { speakerTagId: 't1', method: 'transcript' } });
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: null, label: 'Άγνωστος Ομιλητής 1' },
    });
  });

  it.each([
    ['the import\'s raw label', 'SPEAKER_3'],
    ['the editor\'s new segment', 'New speaker segment'],
    ['an unknown speaker in another language', 'Unknown Speaker 4'],
    ['no label', null],
  ])('replaces a placeholder: %s', async (_case, label) => {
    setup([tag('t1', { label })]);
    await applySpeakerHints('task-1', [], [unlistedHint('t1', LABEL)]);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: 'transcript', label: LABEL },
    });
  });

  it('leaves a label that is not a placeholder, when no run wrote it', async () => {
    setup([tag('t1', { label: 'Κάτοικος' })]);
    await applySpeakerHints('task-1', [], [unlistedHint('t1', LABEL)]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('stores a label the task would not act on, and changes nothing', async () => {
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [], [tentativeUnlisted('t1', 'Παπαδόπουλος')]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(tentativeUnlisted('t1', 'Παπαδόπουλος')));
    expect(mockIdentificationUpsert.mock.calls[0][0].create).toMatchObject({ actionable: false });
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('never overwrites a reviewer\'s label, and still stores the hint', async () => {
    setup([
      tag('typed', { label: 'Παπαδόπουλος Γ. - κάτοικος', personSetBy: 'user' }),
      tag('cleared', { label: 'Άγνωστος Ομιλητής 1', personSetBy: 'user' }),
      tag('added', { label: 'New speaker segment', personSetBy: 'user' }),
      tag('chosen', { personId: 'anna', personSetBy: 'user' }),
    ]);
    await applySpeakerHints('task-1', [], ['typed', 'cleared', 'added', 'chosen'].map(id => unlistedHint(id, LABEL)));

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(4);
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('skips a tag that has a person: the voiceprint match stands, and the hint is stored', async () => {
    setup([voiceprintTag('t1', 'anna'), tag('legacy', { personId: 'babis' })]);
    await applySpeakerHints('task-1', [], [unlistedHint('t1', LABEL), unlistedHint('legacy', LABEL)]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(2);
    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(unlistedHint('t1', LABEL)));
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('keeps the voiceprint match when the voiceprint would act, whatever the transcript says', async () => {
    // The match stands even when its person came from an earlier run on this tag.
    setup([tag('t1', { label: 'SPEAKER_2', personId: 'anna', personSetBy: 'both', identifications: [matched('anna'), asStored(hint('t1', 'anna'))] })]);
    await applySpeakerHints('task-1', [], [unlistedHint('t1', LABEL)]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(unlistedHint('t1', LABEL)));
    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1', ...AUTOMATIC }, data: { personId: 'anna', personSetBy: 'voiceprint' } });
  });

  it('replaces the label an earlier run wrote when a rerun names the speaker differently', async () => {
    const rerun = unlistedHint('t1', 'Παπαδόπουλος Γεώργιος - κάτοικος Χαλέπας');
    setup([labelledTag('t1')]);
    await applySpeakerHints('task-1', [], [rerun]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(rerun));
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: 'transcript', label: rerun.name },
    });
  });

  it('writes nothing when a rerun says the same thing', async () => {
    setup([labelledTag('t1')]);
    await applySpeakerHints('task-1', [], [unlistedHint('t1', LABEL)]);

    expect(mockIdentificationUpsert).not.toHaveBeenCalled();
    expect(mockIdentificationDeleteMany).not.toHaveBeenCalled();
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('takes back the label an earlier run wrote when a rerun would not act on its name', async () => {
    setup([labelledTag('t1'), tag('t2', { label: 'Άγνωστος Ομιλητής 3' })]);
    await applySpeakerHints('task-1', [], [tentativeUnlisted('t1', 'Παπαδόπουλος')]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(tentativeUnlisted('t1', 'Παπαδόπουλος')));
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: null, label: 'Άγνωστος Ομιλητής 4' },
    });
  });

  it('labels a tag whose person an earlier run named and this run does not', async () => {
    setup([tag('t1', { label: 'Άγνωστος Ομιλητής 2', personId: 'anna', personSetBy: 'transcript', identifications: [asStored(hint('t1', 'anna'))] })]);
    await applySpeakerHints('task-1', [], [unlistedHint('t1', LABEL)]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(unlistedHint('t1', LABEL)));
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: 'transcript', label: LABEL },
    });
  });

  it('keeps the label behind a roster person a rerun names, and takes it back with the person', async () => {
    // Run 1 wrote the label; run 2 names a roster person on the same tag.
    setup([labelledTag('t1')]);
    await applySpeakerHints('task-1', [hint('t1', 'anna')]);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1', ...AUTOMATIC }, data: { personId: 'anna', personSetBy: 'transcript' } });

    // Run 3 names nobody: readers must not see the withdrawn name.
    jest.clearAllMocks();
    setup([tag('t1', { label: LABEL, personId: 'anna', personSetBy: 'transcript', identifications: [asStored(hint('t1', 'anna'))] })]);
    await applySpeakerHints('task-1', []);

    expect(mockIdentificationDeleteMany).toHaveBeenCalledWith({ where: { speakerTagId: 't1', method: 'transcript' } });
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: null, label: 'Άγνωστος Ομιλητής 1' },
    });
  });

  it('relabels a tag that carries an earlier label behind a roster person the rerun withdraws', async () => {
    setup([tag('t1', { label: LABEL, personId: 'anna', personSetBy: 'transcript', identifications: [asStored(hint('t1', 'anna'))] })]);
    const rerun = unlistedHint('t1', 'Παπαδόπουλος Γεώργιος - κάτοικος');
    await applySpeakerHints('task-1', [], [rerun]);

    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: 'transcript', label: rerun.name },
    });
  });

  it('gives a tag one transcript opinion: the roster person wins over the unlisted label', async () => {
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [hint('t1', 'anna')], [unlistedHint('t1', LABEL)]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(1);
    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(hint('t1', 'anna')));
    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({ where: { id: 't1', ...AUTOMATIC }, data: { personId: 'anna', personSetBy: 'transcript' } });
  });

  it('falls back to the unlisted label when the roster person is not in the city', async () => {
    setup([tag('t1')], { people: [] });
    await applySpeakerHints('task-1', [hint('t1', 'stranger')], [unlistedHint('t1', LABEL)]);

    expect(mockIdentificationUpsert).toHaveBeenCalledWith(stored(unlistedHint('t1', LABEL)));
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: 'transcript', label: LABEL },
    });
  });

  it('replaces the person an earlier run named with the unlisted label, in one write', async () => {
    setup([tag('t1', { label: 'SPEAKER_5', personId: 'anna', personSetBy: 'transcript', identifications: [asStored(hint('t1', 'anna'))] })]);
    await applySpeakerHints('task-1', [], [unlistedHint('t1', LABEL)]);

    expect(mockTagUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).toHaveBeenCalledWith({
      where: { id: 't1', ...AUTOMATIC },
      data: { personId: null, personSetBy: 'transcript', label: LABEL },
    });
  });

  it('changes no label once human review is complete', async () => {
    setup([tag('t1')], { reviewed: true });
    await applySpeakerHints('task-1', [], [unlistedHint('t1', LABEL)]);

    expect(mockIdentificationUpsert).toHaveBeenCalledTimes(1);
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });

  it('drops a hint for a tag outside the meeting', async () => {
    setup([tag('t1')]);
    await applySpeakerHints('task-1', [], [unlistedHint('gone', LABEL)]);

    expect(mockIdentificationUpsert).not.toHaveBeenCalled();
    expect(mockTagUpdateMany).not.toHaveBeenCalled();
  });
});
