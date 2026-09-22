import JSZip from 'jszip';
import { renderMinutesDocx } from '../MinutesDocx';
import { MinutesData, MinutesSubject } from '@/lib/minutes/types';

function makeMinutesData(overrides: Partial<MinutesData> = {}): MinutesData {
    return {
        city: {
            name: 'Ζωγράφου',
            name_municipality: 'Δήμος Ζωγράφου',
            timezone: 'Europe/Athens',
            logoImage: null,
            realm: 'greece',
        },
        meeting: {
            id: 'meeting-1',
            cityId: 'city-1',
            name: 'Τακτική Συνεδρίαση',
            dateTime: '2024-06-15T18:00:00.000Z',
        },
        administrativeBody: { name: 'Δημοτικό Συμβούλιο', type: 'council' },
        councilComposition: null,
        absentMembers: null,
        preambleEntries: [],
        attendanceChanges: [],
        discussionOrderLabel: null,
        proceduralVotes: [],
        subjects: [],
        epilogueEntries: [],
        ...overrides,
    };
}

function makeSubject(overrides: Partial<MinutesSubject> = {}): MinutesSubject {
    return {
        subjectId: 'subject-1',
        agendaItemIndex: 1,
        agendaSectionIndex: null,
        nonAgendaReason: null,
        withdrawn: false,
        name: 'Έγκριση προϋπολογισμού',
        discussedWith: null,
        discussedElsewhere: null,
        decision: null,
        attendance: null,
        voteResult: null,
        discussion: { kind: 'none', seconds: 0, start: null },
        preDiscussionEntries: [],
        transcriptEntries: [],
        ...overrides,
    };
}

describe('renderMinutesDocx', () => {
    it('should produce a valid Blob for minimal data', async () => {
        const data = makeMinutesData();
        const blob = await renderMinutesDocx(data);
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.size).toBeGreaterThan(0);
        expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should produce a Blob with subjects', async () => {
        const data = makeMinutesData({
            subjects: [
                makeSubject({ subjectId: 's1', agendaItemIndex: 1, name: 'Θέμα 1' }),
                makeSubject({ subjectId: 's2', agendaItemIndex: 2, name: 'Θέμα 2' }),
            ],
        });
        const blob = await renderMinutesDocx(data);
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.size).toBeGreaterThan(0);
    });

    it('should handle subjects with full data', async () => {
        const data = makeMinutesData({
            councilComposition: {
                mayor: { name: 'Δημήτρης Αντωνίου', personId: 'mayor-1' },
                president: { name: 'Γιώργος Παπαδόπουλος', personId: 'p1' },
                members: [
                    { personId: 'p1', name: 'Γιώργος Παπαδόπουλος', party: 'ΝΔ', isPartyHead: false, role: 'Πρόεδρος' },
                    { personId: 'p2', name: 'Μαρία Ιωάννου', party: 'ΣΥΡΙΖΑ', isPartyHead: false, role: null },
                    { personId: 'p3', name: 'Νίκος Δημητρίου', party: 'ΠΑΣΟΚ', isPartyHead: false, role: null },
                ],
                substituteMembers: [
                ],
            },
            subjects: [
                makeSubject({
                    subjectId: 's1',
                    agendaItemIndex: 1,
                    name: 'Έγκριση προϋπολογισμού 2024',
                    decision: {
                        decisionNumber: '123/2024',
                        protocolNumber: '123/2024',
                        excerpt: 'Εγκρίνει **ομόφωνα** τον προϋπολογισμό.',
                        references: '- Ν. 3852/2010\n- Ν. 4555/2018',
                    },
                    voteResult: {
                        forMembers: [
                            { personId: 'p1', name: 'Γιώργος Παπαδόπουλος', party: 'ΝΔ', isPartyHead: false, role: 'Πρόεδρος' },
                            { personId: 'p2', name: 'Μαρία Ιωάννου', party: 'ΣΥΡΙΖΑ', isPartyHead: false, role: null },
                        ],
                        againstMembers: [],
                        abstainMembers: [],
                        presentMembers: [],
                        didNotVoteMembers: [],
                        absentMembers: [
                            { personId: 'p3', name: 'Νίκος Δημητρίου', party: 'ΠΑΣΟΚ', isPartyHead: false, role: null },
                        ],
                        passed: true,
                        isUnanimous: true,
                    },
                    transcriptEntries: [
                        {
                            type: 'speaker',
                            speakerName: 'Γιώργος Παπαδόπουλος',
                            party: 'ΝΔ',
                            isPartyHead: false,
                            role: 'Πρόεδρος',
                            text: 'Θα συζητήσουμε τον προϋπολογισμό.',
                            timestamp: 1200,
                        },
                        {
                            type: 'speaker',
                            speakerName: 'Μαρία Ιωάννου',
                            party: 'ΣΥΡΙΖΑ',
                            isPartyHead: false,
                            role: null,
                            text: 'Συμφωνούμε με την πρόταση.',
                            timestamp: 1320,
                        },
                    ],
                }),
            ],
        });

        const blob = await renderMinutesDocx(data);
        expect(blob).toBeInstanceOf(Blob);
        // Full data should produce a larger blob than empty data
        const minimalBlob = await renderMinutesDocx(makeMinutesData());
        expect(blob.size).toBeGreaterThan(minimalBlob.size);
    });

    it('should handle beforeAgenda subjects', async () => {
        const data = makeMinutesData({
            subjects: [
                makeSubject({
                    subjectId: 'before-1',
                    agendaItemIndex: null,
                    nonAgendaReason: 'beforeAgenda',
                    name: 'Θέμα πριν από ΗΔ',
                }),
            ],
        });
        const blob = await renderMinutesDocx(data);
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.size).toBeGreaterThan(0);
    });

    it('should handle subjects with attendance but no votes', async () => {
        const data = makeMinutesData({
            subjects: [
                makeSubject({
                    attendance: {
                        present: [
                            { personId: 'p1', name: 'Γιώργος', party: null, isPartyHead: false, role: null },
                        ],
                        absent: [],
                    },
                }),
            ],
        });
        const blob = await renderMinutesDocx(data);
        expect(blob).toBeInstanceOf(Blob);
    });

    it('should handle no administrativeBody', async () => {
        const data = makeMinutesData({ administrativeBody: null });
        const blob = await renderMinutesDocx(data);
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.size).toBeGreaterThan(0);
    });
});

/** The rendered text lives in word/document.xml inside the docx zip. */
async function docxText(data: MinutesData): Promise<string> {
    const blob = await renderMinutesDocx(data);
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    return zip.file('word/document.xml')!.async('string');
}

describe('MinutesDocx TOC order', () => {
    it('orders numbered subjects by section, then by number', async () => {
        const text = await docxText(makeMinutesData({
            subjects: [
                makeSubject({
                    subjectId: 'section2-item1',
                    agendaItemIndex: 1,
                    agendaSectionIndex: 2,
                    name: 'Θέμα ενότητας 2',
                }),
                makeSubject({
                    subjectId: 'section1-item1',
                    agendaItemIndex: 1,
                    // No explicit section: this is how a single first section (or a
                    // one-list agenda with no sections at all) is represented.
                    agendaSectionIndex: null,
                    name: 'Θέμα ενότητας 1',
                }),
            ],
        }));

        const section1Index = text.indexOf('Θέμα ενότητας 1');
        const section2Index = text.indexOf('Θέμα ενότητας 2');

        expect(section1Index).toBeGreaterThan(-1);
        expect(section2Index).toBeGreaterThan(-1);
        expect(section1Index).toBeLessThan(section2Index);
    });
});

describe('MinutesDocx decision number', () => {
    it('renders decisionNumber, not protocolNumber', async () => {
        const text = await docxText(makeMinutesData({
            subjects: [makeSubject({
                decision: { decisionNumber: '425/2026', protocolNumber: '29967', excerpt: null, references: null },
            })],
        }));
        expect(text).toContain('425/2026');
        expect(text).not.toContain('29967');
    });

    it('renders nothing when decisionNumber is unknown, even if protocolNumber is set', async () => {
        const text = await docxText(makeMinutesData({
            subjects: [makeSubject({
                decision: { decisionNumber: null, protocolNumber: '29967', excerpt: null, references: null },
            })],
        }));
        expect(text).not.toContain('29967');
    });
});

/** Every visible text run of the rendered document, in order. */
async function docxRuns(data: MinutesData): Promise<string[]> {
    const blob = await renderMinutesDocx(data);
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    const xml = await zip.file('word/document.xml')!.async('string');
    return [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]);
}

/**
 * The guard on "the DOCX output does not change".
 *
 * `MinutesData` grew `subjects[].discussion` and `proceduralVotes` for the
 * decisions page, and the renderer is supposed to ignore both. The assertions
 * above this point check that a Blob comes back with a non-zero size, which
 * stays true when the renderer starts reading a new field, renames every
 * heading, or drops a whole section — so they cannot answer that question.
 *
 * These are differences, not an inventory snapshot: fill the two new fields in
 * and the rendered runs must come back identical. That survives unrelated
 * additions to the document, which a snapshot would not.
 */
describe('MinutesDocx output', () => {
    const member = (personId: string, name: string) =>
        ({ personId, name, party: 'ΝΔ', isPartyHead: false, role: null });

    const populated = (overrides: Partial<MinutesData> = {}): MinutesData => makeMinutesData({
        councilComposition: {
            mayor: { name: 'Δήμαρχος', personId: 'mayor' },
            president: { name: 'Πρόεδρος', personId: 'p1' },
            members: [member('p1', 'Άλφα'), member('p2', 'Βήτα')],
            substituteMembers: [],
        },
        absentMembers: [member('p2', 'Βήτα')],
        attendanceChanges: [{
            personId: 'p3', name: 'Γάμμα', type: 'arrival',
            atSubject: { id: 'subject-1', name: 'Έγκριση προϋπολογισμού', agendaItemIndex: 1, nonAgendaReason: null, outOfAgendaIndex: null },
        }],
        subjects: [makeSubject({
            decision: { decisionNumber: '425/2026', protocolNumber: '29967', excerpt: 'Εγκρίνει ομόφωνα.', references: null },
            transcriptEntries: [{
                type: 'speaker', speakerName: 'Άλφα', party: null, isPartyHead: false, role: null,
                text: 'Τοποθέτηση επί του θέματος.', timestamp: 120,
            }],
        })],
        ...overrides,
    });

    it('renders the spine a reader would notice losing', async () => {
        const all = (await docxRuns(populated())).join('\n');
        expect(all).toContain('ΘΕΜΑ 1');
        expect(all).toContain('425/2026');
        expect(all).toContain('Τοποθέτηση επί του θέματος.');
        expect(all).toContain('Γάμμα');
    });

    it('ignores subjects[].discussion — filling it in changes nothing', async () => {
        const before = await docxRuns(populated());
        const after = await docxRuns(populated({
            subjects: [makeSubject({
                decision: { decisionNumber: '425/2026', protocolNumber: '29967', excerpt: 'Εγκρίνει ομόφωνα.', references: null },
                transcriptEntries: [{
                    type: 'speaker', speakerName: 'Άλφα', party: null, isPartyHead: false, role: null,
                    text: 'Τοποθέτηση επί του θέματος.', timestamp: 120,
                }],
                discussion: { kind: 'discussed', seconds: 930, start: 42 },
            })],
        }));
        expect(after).toEqual(before);
    });

    it('ignores proceduralVotes — filling it in changes nothing', async () => {
        // No attendance changes on either side, so the vote data cannot bring a
        // section of its own back into an otherwise event-free document.
        const quiet = populated({ attendanceChanges: [] });
        const before = await docxRuns(quiet);
        const after = await docxRuns({
            ...quiet,
            proceduralVotes: [{ subjectId: 'subject-1', timestamp: 512 }],
        });
        expect(after).toEqual(before);
    });
});
