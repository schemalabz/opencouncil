import { parseReferences, extractUtteranceIds, ParsedReference } from '../references';

describe('parseReferences', () => {
  it('returns empty array for text with no references', () => {
    expect(parseReferences('Hello world, no references here.')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseReferences('')).toEqual([]);
  });

  it('parses a single utterance reference', () => {
    const text = 'As stated in [this statement](REF:UTTERANCE:utt-123)';
    const result = parseReferences(text);
    expect(result).toEqual<ParsedReference[]>([
      { type: 'utterance', id: 'utt-123', displayText: 'this statement' },
    ]);
  });

  it('parses a single person reference', () => {
    const text = 'According to [Γιώργος Παπαδόπουλος](REF:PERSON:person-456)';
    const result = parseReferences(text);
    expect(result).toEqual<ParsedReference[]>([
      { type: 'person', id: 'person-456', displayText: 'Γιώργος Παπαδόπουλος' },
    ]);
  });

  it('parses a party reference', () => {
    const text = 'The [ΝΔ](REF:PARTY:party-789) voted in favor.';
    const result = parseReferences(text);
    expect(result).toEqual<ParsedReference[]>([
      { type: 'party', id: 'party-789', displayText: 'ΝΔ' },
    ]);
  });

  it('parses a subject reference', () => {
    const text = 'Regarding [urban planning](REF:SUBJECT:subj-001)';
    const result = parseReferences(text);
    expect(result).toEqual<ParsedReference[]>([
      { type: 'subject', id: 'subj-001', displayText: 'urban planning' },
    ]);
  });

  it('parses multiple references of different types', () => {
    const text =
      '[Speaker A](REF:PERSON:p1) discussed [topic X](REF:SUBJECT:s1) ' +
      'and cited [a previous remark](REF:UTTERANCE:u1). ' +
      'The [party](REF:PARTY:pt1) agreed.';
    const result = parseReferences(text);
    expect(result).toHaveLength(4);
    expect(result).toEqual<ParsedReference[]>([
      { type: 'person', id: 'p1', displayText: 'Speaker A' },
      { type: 'subject', id: 's1', displayText: 'topic X' },
      { type: 'utterance', id: 'u1', displayText: 'a previous remark' },
      { type: 'party', id: 'pt1', displayText: 'party' },
    ]);
  });

  it('handles reference IDs with UUIDs', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const text = `[item](REF:UTTERANCE:${uuid})`;
    const result = parseReferences(text);
    expect(result).toEqual<ParsedReference[]>([
      { type: 'utterance', id: uuid, displayText: 'item' },
    ]);
  });

  it('handles display text with special characters', () => {
    const text = '[Σύνδεσμος & Εταίροι](REF:PARTY:p-special)';
    const result = parseReferences(text);
    expect(result).toEqual<ParsedReference[]>([
      { type: 'party', id: 'p-special', displayText: 'Σύνδεσμος & Εταίροι' },
    ]);
  });

  it('ignores malformed references with unknown type', () => {
    const text = '[bad](REF:UNKNOWN:id-1)';
    expect(parseReferences(text)).toEqual([]);
  });

  it('ignores standard markdown links (no REF: prefix)', () => {
    const text = '[OpenCouncil](https://opencouncil.gr)';
    expect(parseReferences(text)).toEqual([]);
  });

  it('ignores references with missing display text brackets', () => {
    const text = 'missing brackets (REF:UTTERANCE:id-1)';
    expect(parseReferences(text)).toEqual([]);
  });

  it('handles multiple references on the same line', () => {
    const text =
      '[A](REF:PERSON:p1) and [B](REF:PERSON:p2) debated [topic](REF:SUBJECT:s1)';
    const result = parseReferences(text);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.id)).toEqual(['p1', 'p2', 's1']);
  });
});

describe('extractUtteranceIds', () => {
  it('returns empty array when no references exist', () => {
    expect(extractUtteranceIds('Plain text with no references')).toEqual([]);
  });

  it('returns empty array when references exist but none are utterances', () => {
    const text = '[person](REF:PERSON:p1) discussed [topic](REF:SUBJECT:s1)';
    expect(extractUtteranceIds(text)).toEqual([]);
  });

  it('extracts a single utterance ID', () => {
    const text = 'Referenced [this](REF:UTTERANCE:utt-42)';
    expect(extractUtteranceIds(text)).toEqual(['utt-42']);
  });

  it('extracts multiple utterance IDs', () => {
    const text =
      '[first](REF:UTTERANCE:u1) and [second](REF:UTTERANCE:u2) and [third](REF:UTTERANCE:u3)';
    expect(extractUtteranceIds(text)).toEqual(['u1', 'u2', 'u3']);
  });

  it('filters out non-utterance references and returns only utterance IDs', () => {
    const text =
      '[speaker](REF:PERSON:p1) said [this](REF:UTTERANCE:u1) about [topic](REF:SUBJECT:s1) ' +
      'and also [that](REF:UTTERANCE:u2)';
    expect(extractUtteranceIds(text)).toEqual(['u1', 'u2']);
  });

  it('returns empty array for empty string', () => {
    expect(extractUtteranceIds('')).toEqual([]);
  });
});
