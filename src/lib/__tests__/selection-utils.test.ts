import { calculateUtteranceRange } from '../selection-utils';

describe('calculateUtteranceRange', () => {
  const utterances = [
    { id: 'u1' },
    { id: 'u2' },
    { id: 'u3' },
    { id: 'u4' },
    { id: 'u5' },
  ];

  it('returns IDs between start and end (inclusive)', () => {
    expect(calculateUtteranceRange(utterances, 'u2', 'u4')).toEqual([
      'u2',
      'u3',
      'u4',
    ]);
  });

  it('returns a single ID when start equals end', () => {
    expect(calculateUtteranceRange(utterances, 'u3', 'u3')).toEqual(['u3']);
  });

  it('returns all IDs when selecting first to last', () => {
    expect(calculateUtteranceRange(utterances, 'u1', 'u5')).toEqual([
      'u1',
      'u2',
      'u3',
      'u4',
      'u5',
    ]);
  });

  it('handles reversed order (end before start)', () => {
    expect(calculateUtteranceRange(utterances, 'u4', 'u2')).toEqual([
      'u2',
      'u3',
      'u4',
    ]);
  });

  it('returns empty array when startId is not found', () => {
    expect(calculateUtteranceRange(utterances, 'nonexistent', 'u3')).toEqual(
      []
    );
  });

  it('returns empty array when endId is not found', () => {
    expect(calculateUtteranceRange(utterances, 'u1', 'nonexistent')).toEqual(
      []
    );
  });

  it('returns empty array when both IDs are not found', () => {
    expect(
      calculateUtteranceRange(utterances, 'nonexistent1', 'nonexistent2')
    ).toEqual([]);
  });

  it('returns empty array for empty utterances list', () => {
    expect(calculateUtteranceRange([], 'u1', 'u2')).toEqual([]);
  });

  it('works with a single-element array', () => {
    const single = [{ id: 'only' }];
    expect(calculateUtteranceRange(single, 'only', 'only')).toEqual(['only']);
  });

  it('returns first two elements correctly', () => {
    expect(calculateUtteranceRange(utterances, 'u1', 'u2')).toEqual([
      'u1',
      'u2',
    ]);
  });

  it('returns last two elements correctly', () => {
    expect(calculateUtteranceRange(utterances, 'u4', 'u5')).toEqual([
      'u4',
      'u5',
    ]);
  });

  it('handles UUID-style IDs', () => {
    const uuidUtterances = [
      { id: 'a1b2c3d4-0001' },
      { id: 'a1b2c3d4-0002' },
      { id: 'a1b2c3d4-0003' },
    ];
    expect(
      calculateUtteranceRange(
        uuidUtterances,
        'a1b2c3d4-0001',
        'a1b2c3d4-0003'
      )
    ).toEqual(['a1b2c3d4-0001', 'a1b2c3d4-0002', 'a1b2c3d4-0003']);
  });
});
