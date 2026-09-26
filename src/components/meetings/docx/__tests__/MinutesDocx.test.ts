import JSZip from 'jszip';
import { renderMinutesDocx } from '../MinutesDocx';
import { MinutesData, MinutesSubject } from '@/lib/minutes/types';
import { committeeWithSubstitute, councilWithAbsentPresident } from '@/lib/minutes/__tests__/rollCallFixtures';

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
        attendanceChangesSource: 'diff',
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
        nonAgendaReason: null,
        withdrawn: false,
        name: 'Έγκριση προϋπολογισμού',
        discussedWith: null,
        discussedElsewhere: null,
        decision: null,
        presidedBy: null,
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
                mayor: { name: 'Δημήτρης Αντωνίου', personId: 'mayor-1', note: null },
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
                        voteResultPhrase: null,
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
                        fromPhraseOnly: false,
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

describe('MinutesDocx decision number', () => {
    it('renders decisionNumber, not protocolNumber', async () => {
        const text = await docxText(makeMinutesData({
            subjects: [makeSubject({
                decision: { decisionNumber: '425/2026', protocolNumber: '29967', excerpt: null, references: null, voteResultPhrase: null },
            })],
        }));
        expect(text).toContain('425/2026');
        expect(text).not.toContain('29967');
    });

    it('renders nothing when decisionNumber is unknown, even if protocolNumber is set', async () => {
        const text = await docxText(makeMinutesData({
            subjects: [makeSubject({
                decision: { decisionNumber: null, protocolNumber: '29967', excerpt: null, references: null, voteResultPhrase: null },
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
            mayor: { name: 'Δήμαρχος', personId: 'mayor', note: null },
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
            decision: { decisionNumber: '425/2026', protocolNumber: '29967', excerpt: 'Εγκρίνει ομόφωνα.', references: null, voteResultPhrase: null },
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
                decision: { decisionNumber: '425/2026', protocolNumber: '29967', excerpt: 'Εγκρίνει ομόφωνα.', references: null, voteResultPhrase: null },
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

/**
 * The roll call the minutes print before the first subject, run by run. The
 * decisions page reads the same lines, so a change here is a change there too.
 */
describe('MinutesDocx roll call', () => {
    it('prints a committee the mayor presides, with a substitute sitting in', async () => {
        expect(await docxRuns(committeeWithSubstitute())).toMatchSnapshot();
    });

    it('prints no «(ΔΗΜΑΡΧΟΣ)» after a committee president who is not the mayor, and no mayor line', async () => {
        const data = committeeWithSubstitute();
        data.councilComposition!.president = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        const runs = await docxRuns(data);
        expect(runs).toContain('Πετσέλης Χρήστος');
        expect(runs.join('\n')).not.toContain('ΔΗΜΑΡΧΟΣ');
    });

    it('prints the mayor\'s arrival once, in the note on the president\'s line of a committee the mayor presides', async () => {
        // getMinutesData puts a presiding mayor's arrivals and departures in the
        // note and leaves them out of the changes list.
        const data = committeeWithSubstitute();
        data.councilComposition!.mayor!.note = 'προσήλθε από το 3ο θέμα';
        data.attendanceChanges = [];
        const runs = await docxRuns(data);
        expect(runs[runs.indexOf('Μαλτέζος Ιωάννης (ΔΗΜΑΡΧΟΣ)') + 1]).toBe(' (προσήλθε από το 3ο θέμα)');
        expect(runs.filter(r => r.includes('από το 3ο θέμα'))).toHaveLength(1);
    });

    it('prints a council with the mayor apart and the president absent', async () => {
        expect(await docxRuns(councilWithAbsentPresident())).toMatchSnapshot();
    });

    it('names who presided first when the mayor who presides a committee was absent, and lists the mayor as absent with the office', async () => {
        // getMinutesData then puts the mayor's arrival in the changes list, and the note stays off the line.
        const data = committeeWithSubstitute();
        const composition = data.councilComposition!;
        composition.mayor!.note = 'ΑΠΩΝ';
        composition.presidedBy = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        data.absentMembers = [...data.absentMembers!, composition.members.find(m => m.personId === 'mayor')!];
        const runs = await docxRuns(data);
        const line = runs.indexOf('ΠΡΟΕΔΡΟΣ: ');
        expect(runs.slice(line, line + 3)).toEqual(['ΠΡΟΕΔΡΟΣ: ', 'Πετσέλης Χρήστος', ' (λόγω απουσίας του ΠΡΟΕΔΡΟΥ, ΔΗΜΑΡΧΟΥ Μαλτέζος Ιωάννης)']);
        expect(runs).toContain('ΑΠΟΝΤΑ ΜΕΛΗ (2)');
        expect(runs[runs.indexOf('Μαλτέζος Ιωάννης') + 1]).toBe(' (ΠΡΟΕΔΡΟΣ, ΔΗΜΑΡΧΟΣ, Άργος Πρώτα)');
        expect(runs.join('\n')).not.toContain('ΑΠΩΝ');
    });

    it('names who presided on a council whose president was absent, and puts the president in the absence sentence', async () => {
        const data = councilWithAbsentPresident();
        data.councilComposition!.presidedBy = { name: 'Παπαγιαννάκη Νίκη', personId: 'p3' };
        const runs = await docxRuns(data);
        const line = runs.indexOf('ΠΡΟΕΔΡΟΣ: ');
        expect(runs.slice(line, line + 3)).toEqual(['ΠΡΟΕΔΡΟΣ: ', 'Παπαγιαννάκη Νίκη', ' (λόγω απουσίας της ΠΡΟΕΔΡΟΥ Καραγιάννη Τάνια)']);
        expect(runs).toContain('Καραγιάννη Τάνια (ΠΡΟΕΔΡΟΣ), Λαμπρόπουλος Παναγιώτης');
    });
});
