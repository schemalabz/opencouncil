import { renderMinutesDocx } from '../MinutesDocx';
import { MinutesData, MinutesSubject } from '@/lib/minutes/types';

function makeMinutesData(overrides: Partial<MinutesData> = {}): MinutesData {
    return {
        city: {
            name: 'Ζωγράφου',
            name_municipality: 'Δήμος Ζωγράφου',
            timezone: 'Europe/Athens',
        },
        meeting: {
            id: 'meeting-1',
            cityId: 'city-1',
            name: 'Τακτική Συνεδρίαση',
            dateTime: '2024-06-15T18:00:00.000Z',
        },
        administrativeBody: 'Δημοτικό Συμβούλιο',
        overallAttendance: null,
        subjects: [],
        ...overrides,
    };
}

function makeSubject(overrides: Partial<MinutesSubject> = {}): MinutesSubject {
    return {
        subjectId: 'subject-1',
        agendaItemIndex: 1,
        nonAgendaReason: null,
        name: 'Έγκριση προϋπολογισμού',
        decision: null,
        attendance: null,
        voteResult: null,
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
            overallAttendance: {
                present: [
                    { personId: 'p1', name: 'Γιώργος Παπαδόπουλος', party: 'ΝΔ', role: 'Πρόεδρος' },
                    { personId: 'p2', name: 'Μαρία Ιωάννου', party: 'ΣΥΡΙΖΑ', role: null },
                ],
                absent: [
                    { personId: 'p3', name: 'Νίκος Δημητρίου', party: 'ΠΑΣΟΚ', role: null },
                ],
            },
            subjects: [
                makeSubject({
                    subjectId: 's1',
                    agendaItemIndex: 1,
                    name: 'Έγκριση προϋπολογισμού 2024',
                    decision: {
                        protocolNumber: '123/2024',
                        excerpt: 'Εγκρίνει **ομόφωνα** τον προϋπολογισμό.',
                        references: '- Ν. 3852/2010\n- Ν. 4555/2018',
                    },
                    voteResult: {
                        forMembers: [
                            { personId: 'p1', name: 'Γιώργος Παπαδόπουλος', party: 'ΝΔ', role: 'Πρόεδρος' },
                            { personId: 'p2', name: 'Μαρία Ιωάννου', party: 'ΣΥΡΙΖΑ', role: null },
                        ],
                        againstMembers: [],
                        abstainMembers: [],
                        passed: true,
                        isUnanimous: true,
                    },
                    transcriptEntries: [
                        {
                            speakerName: 'Γιώργος Παπαδόπουλος',
                            party: 'ΝΔ',
                            role: 'Πρόεδρος',
                            text: 'Θα συζητήσουμε τον προϋπολογισμό.',
                            timestamp: 1200,
                        },
                        {
                            speakerName: 'Μαρία Ιωάννου',
                            party: 'ΣΥΡΙΖΑ',
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
                            { personId: 'p1', name: 'Γιώργος', party: null, role: null },
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
