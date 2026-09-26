import { AttendanceStatus, DiscussionStatus, VoteType } from '@prisma/client';
import {
    buildAttendance,
    buildAttendanceChanges,
    buildVoteResult,
    buildCouncilComposition,
    buildMayorNote,
    buildRollCall,
    buildSubjectRollCall,
    formatRollCallMemberLabel,
    formatRollCallSentenceName,
    formatChangePosition,
    formatPhraseOnlyOutcome,
    sortSubjectsByDiscussionOrder,
    orderedMinutesSubjects,
    discussionOrderKeys,
    discussionOrderLabel,
    discussedElsewhereIds,
    sortByElectedOrder,
    buildDiscussionSummary,
    buildProceduralVotes,
    MemberResolver,
    ElectedOrderGetter,
} from '../builders';
import { MinutesMember } from '../types';
import { committeeWithSubstitute, councilWithAbsentPresident } from './rollCallFixtures';
import spartaMay6 from './fixtures/sparta-may6-2026-utterances.json';

// --- Test helpers ---

/** Simple resolver that formats name surname-first and attaches no party/role info. */
const simpleResolver: MemberResolver = (personId, name) => ({
    personId,
    name: `resolved-${name}`,
    party: null,
    isPartyHead: false,
    role: null,
});

/** Resolver that attaches party info based on personId prefix. */
const partyResolver: MemberResolver = (personId, name) => ({
    personId,
    name: `resolved-${name}`,
    party: personId.startsWith('nd-') ? 'ΝΔ' : personId.startsWith('syriza-') ? 'ΣΥΡΙΖΑ' : null,
    isPartyHead: personId.endsWith('-head'),
    role: personId.startsWith('mayor-') ? 'Δήμαρχος' : null,
});

/** No elected order for anyone. */
const noElectedOrder: ElectedOrderGetter = () => null;

/** Elected order from a lookup map. */
function makeElectedOrder(orders: Record<string, number>): ElectedOrderGetter {
    return (personId) => orders[personId] ?? null;
}

function makeAttendance(personId: string, name: string, status: AttendanceStatus) {
    return { personId, personName: name, status };
}

function makeVote(personId: string, name: string, voteType: VoteType) {
    return { personId, personName: name, voteType };
}

// --- buildAttendance ---

describe('buildAttendance', () => {
    it('splits attendance into present and absent', () => {
        const attendance = [
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'ABSENT'),
            makeAttendance('p3', 'Charlie', 'PRESENT'),
        ];

        const result = buildAttendance(attendance, null, simpleResolver, noElectedOrder);

        expect(result.present).toHaveLength(2);
        expect(result.absent).toHaveLength(1);
        expect(result.present.map(m => m.personId)).toEqual(['p1', 'p3']);
        expect(result.absent.map(m => m.personId)).toEqual(['p2']);
    });

    it('excludes mayor from both present and absent', () => {
        const attendance = [
            makeAttendance('mayor-1', 'Mayor', 'PRESENT'),
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'ABSENT'),
        ];

        const result = buildAttendance(attendance, 'mayor-1', simpleResolver, noElectedOrder);

        expect(result.present).toHaveLength(1);
        expect(result.absent).toHaveLength(1);
        expect(result.present[0].personId).toBe('p1');
        expect(result.absent[0].personId).toBe('p2');
    });

    it('sorts by elected order (ascending, nulls last)', () => {
        const attendance = [
            makeAttendance('p3', 'Charlie', 'PRESENT'),
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'PRESENT'),
        ];
        const electedOrder = makeElectedOrder({ p1: 3, p2: 1, p3: 2 });

        const result = buildAttendance(attendance, null, simpleResolver, electedOrder);

        expect(result.present.map(m => m.personId)).toEqual(['p2', 'p3', 'p1']);
    });

    it('sorts by name when elected orders are equal', () => {
        const attendance = [
            makeAttendance('p1', 'Ζωή', 'PRESENT'),
            makeAttendance('p2', 'Αλέξης', 'PRESENT'),
        ];

        const result = buildAttendance(attendance, null, simpleResolver, noElectedOrder);

        // Both have null elected order, so sorted by name (Greek: Α before Ζ)
        expect(result.present.map(m => m.personId)).toEqual(['p2', 'p1']);
    });

    it('uses the member resolver for display info', () => {
        const attendance = [
            makeAttendance('nd-1', 'Nikos', 'PRESENT'),
        ];

        const result = buildAttendance(attendance, null, partyResolver, noElectedOrder);

        expect(result.present[0].party).toBe('ΝΔ');
        expect(result.present[0].name).toBe('resolved-Nikos');
    });

    it('returns empty arrays when all are excluded (only mayor)', () => {
        const attendance = [
            makeAttendance('mayor-1', 'Mayor', 'PRESENT'),
        ];

        const result = buildAttendance(attendance, 'mayor-1', simpleResolver, noElectedOrder);

        expect(result.present).toEqual([]);
        expect(result.absent).toEqual([]);
    });

    it('handles empty attendance', () => {
        const result = buildAttendance([], null, simpleResolver, noElectedOrder);

        expect(result.present).toEqual([]);
        expect(result.absent).toEqual([]);
    });
});

// --- buildVoteResult ---

describe('buildVoteResult', () => {
    it('returns null when there are no votes', () => {
        const result = buildVoteResult([], [], null, simpleResolver, noElectedOrder);
        expect(result).toBeNull();
    });

    it('categorizes votes into for/against/abstain', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'AGAINST'),
            makeVote('p3', 'Charlie', 'ABSTAIN'),
            makeVote('p4', 'Diana', 'FOR'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result).not.toBeNull();
        expect(result!.forMembers).toHaveLength(2);
        expect(result!.againstMembers).toHaveLength(1);
        expect(result!.abstainMembers).toHaveLength(1);
    });

    it('detects passed vote (FOR > AGAINST)', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
            makeVote('p3', 'Charlie', 'AGAINST'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result).toMatchObject({ passed: true, isUnanimous: false });
    });

    it('detects failed vote (AGAINST > FOR)', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'AGAINST'),
            makeVote('p3', 'Charlie', 'AGAINST'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result).toMatchObject({ passed: false });
    });

    it('tie does not pass (FOR === AGAINST)', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'AGAINST'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result).toMatchObject({ passed: false });
    });

    it('detects unanimous vote (all FOR)', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
            makeVote('p3', 'Charlie', 'FOR'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result).toMatchObject({ isUnanimous: true, passed: true });
    });

    it('is not unanimous when abstains are present', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
            makeVote('p3', 'Charlie', 'ABSTAIN'),
        ];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result).toMatchObject({ isUnanimous: false, passed: true });
    });

    it('single FOR vote is unanimous and passed', () => {
        const votes = [makeVote('p1', 'Alice', 'FOR')];

        const result = buildVoteResult(votes, [], null, simpleResolver, noElectedOrder);

        expect(result).toMatchObject({ isUnanimous: true, passed: true });
    });

    it('derives absent members from attendance minus voters minus mayor', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
        ];
        const attendance = [
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'PRESENT'),
            makeAttendance('p3', 'Charlie', 'ABSENT'),
            makeAttendance('p4', 'Diana', 'ABSENT'),
            makeAttendance('mayor-1', 'Mayor', 'PRESENT'),
        ];

        const result = buildVoteResult(votes, attendance, 'mayor-1', simpleResolver, noElectedOrder);

        // p3 and p4 are absent and didn't vote, mayor is excluded
        expect(result!.absentMembers).toHaveLength(2);
        expect(result!.absentMembers.map(m => m.personId)).toEqual(['p3', 'p4']);
    });

    it('does not count present non-voters as absent', () => {
        const votes = [makeVote('p1', 'Alice', 'FOR')];
        const attendance = [
            makeAttendance('p1', 'Alice', 'PRESENT'),
            makeAttendance('p2', 'Bob', 'PRESENT'), // present but didn't vote
        ];

        const result = buildVoteResult(votes, attendance, null, simpleResolver, noElectedOrder);

        // p2 is PRESENT so not in absentMembers, even though they didn't vote
        expect(result!.absentMembers).toHaveLength(0);
    });

    it('does not double-count voters who are also in attendance', () => {
        const votes = [
            makeVote('p1', 'Alice', 'FOR'),
        ];
        const attendance = [
            makeAttendance('p1', 'Alice', 'ABSENT'), // marked absent but voted
        ];

        const result = buildVoteResult(votes, attendance, null, simpleResolver, noElectedOrder);

        // p1 voted, so should NOT appear in absentMembers even though marked absent
        expect(result!.absentMembers).toHaveLength(0);
        expect(result!.forMembers).toHaveLength(1);
    });

    it('sorts vote categories by elected order', () => {
        const votes = [
            makeVote('p3', 'Charlie', 'FOR'),
            makeVote('p1', 'Alice', 'FOR'),
            makeVote('p2', 'Bob', 'FOR'),
        ];
        const electedOrder = makeElectedOrder({ p1: 2, p2: 1, p3: 3 });

        const result = buildVoteResult(votes, [], null, simpleResolver, electedOrder);

        expect(result!.forMembers.map(m => m.personId)).toEqual(['p2', 'p1', 'p3']);
    });

    it('reads the outcome off the phrase when the document named no voter', () => {
        const result = buildVoteResult([], [], null, simpleResolver, noElectedOrder, 'Ομόφωνα');

        expect(result).toMatchObject({ fromPhraseOnly: true, outcome: 'unanimous', phrase: 'Ομόφωνα' });
        expect(result!.forMembers).toEqual([]);
    });

    it('a phrase that names a majority is a majority', () => {
        const result = buildVoteResult([], [], null, simpleResolver, noElectedOrder, 'Κατά πλειοψηφία');

        expect(result).toMatchObject({ fromPhraseOnly: true, outcome: 'majority' });
    });

    it('rows that hold the named dissent but no FOR print the phrase, not a rejection', () => {
        // Athens ΔΕ 22/06/2026: «ΥΠΕΡ: 7, ΚΑΤΑ 1, ΛΕΥΚΟ 1», the two dissenters named,
        // and no FOR inferred because more unnamed members were present than seven.
        // Counting the rows would print a carried decision as 0–1 and rejected.
        const phrase = 'Κατά πλειοψηφία με ΥΠΕΡ: 7 ψήφους, ΚΑΤΑ 1, ΛΕΥΚΟ 1';
        const votes = [makeVote('p2', 'Bob', 'AGAINST'), makeVote('p3', 'Charlie', 'ABSTAIN')];
        expect(buildVoteResult(votes, [], null, simpleResolver, noElectedOrder, phrase))
            .toMatchObject({ fromPhraseOnly: true, outcome: 'majority', phrase });
    });

    it('a phrase that counts and names no outcome names none', () => {
        // Vrilissia's wording where nobody voted against and somebody declared
        // ΠΑΡΩΝ: neither «ομόφωνα» nor «κατά πλειοψηφία» is what the page
        // said, so the minutes print the page's own sentence instead of a word.
        const phrase = 'Με πέντε (5) θετικές ψήφους';
        expect(buildVoteResult([], [], null, simpleResolver, noElectedOrder, phrase))
            .toMatchObject({ fromPhraseOnly: true, outcome: null, phrase });
    });

    it('reads the formal «ομοφώνως» as unanimity too', () => {
        // The tonos on the ω is what a `φων` pattern misses.
        const result = buildVoteResult([], [], null, simpleResolver, noElectedOrder, 'Εγκρίνεται ομοφώνως');

        expect(result).toMatchObject({ fromPhraseOnly: true, outcome: 'unanimous' });
    });

    it('a phrase that states no outcome is no result at all', () => {
        // `voteResultPhrase` is the extractor's verbatim field: it carries whatever
        // the document decided, and «ΑΝΑΒΑΛΛΕΙ» must not print as «Κατά πλειοψηφία».
        expect(buildVoteResult([], [], null, simpleResolver, noElectedOrder, 'ΑΝΑΒΑΛΛΕΙ')).toBeNull();
        expect(buildVoteResult([], [], null, simpleResolver, noElectedOrder,
            'ΓΝΩΜΟΔΟΤΕΙ θετικά επί του υπ. αριθμ. 12 αιτήματος')).toBeNull();
    });

    it('counted votes are never from the phrase', () => {
        const result = buildVoteResult([makeVote('p1', 'Alice', 'FOR')], [], null, simpleResolver, noElectedOrder, 'Ομόφωνα');

        expect(result).toMatchObject({ fromPhraseOnly: false, forMembers: [expect.objectContaining({ personId: 'p1' })] });
    });
});

// --- formatPhraseOnlyOutcome ---

describe('formatPhraseOnlyOutcome', () => {
    it('prints the outcome word the document named', () => {
        expect(formatPhraseOnlyOutcome({ outcome: 'unanimous', phrase: 'ΑΠΟΦΑΣΙΖΕΙ ΟΜΟΦΩΝΑ' })).toBe('Ομόφωνα');
        expect(formatPhraseOnlyOutcome({ outcome: 'majority', phrase: 'Κατά πλειοψηφία με ΥΠΕΡ: 7' })).toBe('Κατά πλειοψηφία');
    });

    it("prints the document's own sentence when it named no outcome", () => {
        // «Κατά πλειοψηφία» here would be Athens' word on Vrilissia's page, where
        // nobody voted against and the outcome word was left out on purpose.
        expect(formatPhraseOnlyOutcome({ outcome: null, phrase: 'Με δεκαεννιά (19) θετικές ψήφους' }))
            .toBe('Με δεκαεννιά (19) θετικές ψήφους');
    });
});

// --- buildMayorNote ---

describe('buildMayorNote', () => {
    const mayorChange = {
        anchorLabel: null,
        atSubject: { id: 's4', name: 'Θέμα 4', agendaItemIndex: 4, nonAgendaReason: null, outOfAgendaIndex: null },
    };

    it('says that the mayor was absent, and leaves who presided to the president\'s line', () => {
        expect(buildMayorNote('ABSENT', [], true)).toBe('ΑΠΟΥΣΑ');
        expect(buildMayorNote('ABSENT', [], false)).toBe('ΑΠΩΝ');
    });

    it("states a present mayor's own departure", () => {
        // The label is what `buildAttendanceChangesFromEvents` emits — the position
        // phrase the Προσελεύσεις/Αποχωρήσεις lists print, preposition included.
        expect(buildMayorNote('PRESENT', [{ type: 'departure', label: formatChangePosition(mayorChange) }], true))
            .toBe('αποχώρησε από το 4ο θέμα');
    });

    it('prints an anchor the document gave instead of a subject', () => {
        expect(buildMayorNote('PRESENT', [{ type: 'arrival', label: formatChangePosition({ ...mayorChange, anchorLabel: 'στην 286 ΑΚΣ' }) }], false))
            .toBe('προσήλθε στην 286 ΑΚΣ');
    });

    it('says nothing when the mayor was there throughout', () => {
        expect(buildMayorNote('PRESENT', [], false)).toBeNull();
        expect(buildMayorNote(null, [], false)).toBeNull();
    });
});

// --- buildAttendanceChanges (older polls: per-subject diffs, no events) ---

describe('buildAttendanceChanges', () => {
    const member = (personId: string, name: string): MinutesMember => ({ personId, name, party: null, isPartyHead: false, role: null });
    const mayor = member('mayor', 'Μαλτέζος Ιωάννης');
    const m1 = member('m1', 'Λιόλιος Αντώνης');
    const subject = (id: string, index: number, present: MinutesMember[], absent: MinutesMember[]) => ({
        subjectId: id, name: `Θέμα ${index}`, agendaItemIndex: index, nonAgendaReason: null, attendance: { present, absent },
    });
    // The mayor and m1 both leave before the 2nd item.
    const subjects = [subject('s1', 1, [mayor, m1], []), subject('s2', 2, [], [mayor, m1])];

    it("takes the mayor's own departure out of the list when the mayor's note prints it", () => {
        const { changes, mayorChanges } = buildAttendanceChanges(subjects, [], 'mayor');
        expect(changes.map(c => c.personId)).toEqual(['m1']);
        expect(mayorChanges).toEqual([{ type: 'departure', label: 'από το 2ο θέμα' }]);
    });

    it("keeps the mayor's departure in the list when no mayor is passed", () => {
        const { changes, mayorChanges } = buildAttendanceChanges(subjects, [], null);
        expect(changes.map(c => c.personId)).toEqual(['mayor', 'm1']);
        expect(mayorChanges).toEqual([]);
    });
});

// --- buildCouncilComposition ---

describe('buildRollCall', () => {
    const rollCallOf = (data: ReturnType<typeof committeeWithSubstitute>) => buildRollCall(
        data.councilComposition!, new Set((data.absentMembers ?? []).map(m => m.personId)), data.administrativeBody?.type ?? null,
    );
    const names = (entries: Array<{ member: MinutesMember }>) => entries.map(e => e.member.name);

    it('gives a committee no ΔΗΜΑΡΧΟΣ line, and lists members with substitutes after their party', () => {
        const rollCall = rollCallOf(committeeWithSubstitute());
        expect(rollCall.isCommittee).toBe(true);
        expect(rollCall.mayor).toBeNull();
        expect(names(rollCall.present)).toEqual(['Μαλτέζος Ιωάννης', 'Πετσέλης Χρήστος', 'Λιόλιος Αντώνης', 'Δημάκης Γιώργος']);
        expect(rollCall.present.map(e => e.isSubstitute)).toEqual([false, false, false, true]);
        expect(names(rollCall.absent)).toEqual(['Κολεβέντης Φώτιος']);
    });

    it('names the mayor on a committee president\'s line only when the mayor presides', () => {
        expect(rollCallOf(committeeWithSubstitute()).president).toMatchObject({ name: 'Μαλτέζος Ιωάννης', isMayor: true });
        const data = committeeWithSubstitute();
        data.councilComposition!.president = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        const rollCall = rollCallOf(data);
        expect(rollCall.mayor).toBeNull();
        expect(rollCall.president).toMatchObject({ name: 'Πετσέλης Χρήστος', isMayor: false });
    });

    it('puts the mayor\'s note on the president\'s line of a committee the mayor presides', () => {
        // A presiding mayor's note holds the absence and the mayor's arrivals and
        // departures; getMinutesData keeps those changes out of the list. No
        // document names who presided here, so the line names the mayor.
        const note = 'ΑΠΩΝ, προσήλθε από το 3ο θέμα';
        const data = committeeWithSubstitute();
        data.councilComposition!.mayor!.note = note;
        data.absentMembers = [...data.absentMembers!, simpleResolver('mayor', 'Μαλτέζος Ιωάννης')];
        const rollCall = rollCallOf(data);
        expect(rollCall.president).toMatchObject({ isMayor: true, absent: true, presidedBy: null, note, printedName: 'Μαλτέζος Ιωάννης (ΔΗΜΑΡΧΟΣ)', printedNote: note });
        expect(names(rollCall.absent)).toEqual(['Μαλτέζος Ιωάννης', 'Κολεβέντης Φώτιος']);
        expect(rollCall.absent.map(formatRollCallMemberLabel)).toEqual(['ΠΡΟΕΔΡΟΣ, ΔΗΜΑΡΧΟΣ, Άργος Πρώτα', 'Νέα Πνοή']);
        data.councilComposition!.president = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        expect(rollCallOf(data).president).toMatchObject({ isMayor: false, note: null, printedNote: null });
    });

    it('counts a committee member mayor who does not preside among the members, with no line of their own', () => {
        const data = committeeWithSubstitute();
        data.councilComposition!.president = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        const rollCall = rollCallOf(data);
        expect(rollCall.mayor).toBeNull();
        expect(rollCall.president).toMatchObject({ name: 'Πετσέλης Χρήστος', isMayor: false, note: null });
        expect(names(rollCall.present)).toContain('Μαλτέζος Ιωάννης');
        expect(rollCall.present).toHaveLength(4);
    });

    it('names who presided first when the mayor who presides a committee was absent, and lists the mayor as absent with the office', () => {
        const data = committeeWithSubstitute();
        data.councilComposition!.mayor!.note = 'ΑΠΩΝ';
        data.councilComposition!.presidedBy = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        data.absentMembers = [...data.absentMembers!, simpleResolver('mayor', 'Μαλτέζος Ιωάννης')];
        const rollCall = rollCallOf(data);
        expect(rollCall.president).toMatchObject({
            name: 'Μαλτέζος Ιωάννης', personId: 'mayor', absent: true, isMayor: true, feminine: false,
            presidedBy: { name: 'Πετσέλης Χρήστος', personId: 'm1' }, note: null,
            printedName: 'Πετσέλης Χρήστος',
            printedNote: 'λόγω απουσίας του ΠΡΟΕΔΡΟΥ, ΔΗΜΑΡΧΟΥ Μαλτέζος Ιωάννης',
        });
        expect(names(rollCall.absent)).toEqual(['Μαλτέζος Ιωάννης', 'Κολεβέντης Φώτιος']);
        expect(rollCall.absent.map(e => e.office)).toEqual([{ isMayor: true, feminine: false }, null]);
        expect(rollCall.present.every(e => e.office === null)).toBe(true);
    });

    it("names the person a subject's own document says presided, over the meeting's", () => {
        const data = committeeWithSubstitute();
        data.councilComposition!.presidedBy = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        const absentIds = new Set([...data.absentMembers!.map(m => m.personId), 'mayor']);
        const subjectRollCall = buildRollCall(data.councilComposition!, absentIds, 'committee', { name: 'Άλλος Ένας', personId: 'other' });
        expect(subjectRollCall.president).toMatchObject({ presidedBy: { name: 'Άλλος Ένας', personId: 'other' }, printedName: 'Άλλος Ένας' });
        // Without a value of its own, the roll call names the meeting's.
        expect(buildRollCall(data.councilComposition!, absentIds, 'committee').president).toMatchObject({ printedName: 'Πετσέλης Χρήστος' });
    });

    it('names the president when the president was present, whoever a document says presided', () => {
        const data = committeeWithSubstitute();
        data.councilComposition!.presidedBy = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        expect(rollCallOf(data).president).toMatchObject({ presidedBy: null, printedName: 'Μαλτέζος Ιωάννης (ΔΗΜΑΡΧΟΣ)', printedNote: null });
    });

    it('keeps an absent president on the line when the document names the president as the one who presided', () => {
        const data = councilWithAbsentPresident();
        data.councilComposition!.presidedBy = { name: 'ΚΑΡΑΓΙΑΝΝΗ ΤΑΝΙΑ', personId: 'p1' };
        const rollCall = rollCallOf(data);
        expect(rollCall.president).toMatchObject({ presidedBy: null, printedName: 'Καραγιάννη Τάνια', printedNote: 'ΑΠΟΥΣΑ' });
        expect(names(rollCall.absent)).toEqual(['Λαμπρόπουλος Παναγιώτης']);
    });

    it('names who presided on a council whose president was absent, and puts the president in the absence sentence', () => {
        const data = councilWithAbsentPresident();
        data.councilComposition!.presidedBy = { name: 'ΠΑΠΑΓΙΑΝΝΑΚΗ ΝΙΚΗ', personId: null };
        const rollCall = rollCallOf(data);
        expect(rollCall.president).toMatchObject({
            name: 'Καραγιάννη Τάνια', absent: true, isMayor: false, feminine: true,
            printedName: 'ΠΑΠΑΓΙΑΝΝΑΚΗ ΝΙΚΗ', printedNote: 'λόγω απουσίας της ΠΡΟΕΔΡΟΥ Καραγιάννη Τάνια',
        });
        expect(rollCall.absent.map(formatRollCallSentenceName)).toEqual(['Καραγιάννη Τάνια (ΠΡΟΕΔΡΟΣ)', 'Λαμπρόπουλος Παναγιώτης']);
        // The mayor's line does not change: the council's mayor never presides.
        expect(rollCall.mayor).toMatchObject({ name: 'Ρούσσος Σίμος', note: 'αποχώρησε από το 4ο θέμα' });
    });

    it('gives a council the ΔΗΜΑΡΧΟΣ line with its note, and keeps an absent president out of the absence sentence', () => {
        const rollCall = rollCallOf(councilWithAbsentPresident());
        expect(rollCall.mayor).toMatchObject({ name: 'Ρούσσος Σίμος', absent: false, note: 'αποχώρησε από το 4ο θέμα', printedNote: 'αποχώρησε από το 4ο θέμα' });
        expect(rollCall.president).toMatchObject({ name: 'Καραγιάννη Τάνια', absent: true, isMayor: false, printedNote: 'ΑΠΟΥΣΑ' });
        expect(names(rollCall.present)).toEqual(['Παπαγιαννάκη Νίκη']);
        expect(names(rollCall.absent)).toEqual(['Λαμπρόπουλος Παναγιώτης']);
    });

    it('prints ΑΠΩΝ for an absent mayor with no note', () => {
        const data = councilWithAbsentPresident();
        data.councilComposition!.mayor!.note = null;
        const rollCall = buildRollCall(data.councilComposition!, new Set(['mayor']), 'council');
        expect(rollCall.mayor).toMatchObject({ absent: true, note: null, printedNote: 'ΑΠΩΝ' });
    });
});

describe('buildSubjectRollCall', () => {
    const member = (personId: string, name: string, party: string | null = null): MinutesMember => ({ personId, name, party, isPartyHead: false, role: null });
    const names = (entries: Array<{ member: MinutesMember }>) => entries.map(e => e.member.name);

    it('counts and names a member the roll call does not name, from the subject\'s own attendance', () => {
        // chalandri/aug20_2026 items 7–11: Ευθυμίου has subject rows and votes, and no roll-call row.
        const data = committeeWithSubstitute();
        const attendance = {
            present: [member('mayor', 'Μαλτέζος Ιωάννης'), member('m1', 'Πετσέλης Χρήστος'), member('m2', 'Λιόλιος Αντώνης'),
                member('s1', 'Δημάκης Γιώργος'), member('x', 'Ευθυμίου Κωνσταντίνος')],
            absent: [member('m3', 'Κολεβέντης Φώτιος')],
        };
        const rollCall = buildSubjectRollCall(data.councilComposition, attendance, 'committee', null);
        expect(rollCall.present).toHaveLength(5);
        expect(names(rollCall.present)).toContain('Ευθυμίου Κωνσταντίνος');
        expect(names(rollCall.absent)).toEqual(['Κολεβέντης Φώτιος']);
        expect(rollCall.president).toMatchObject({ name: 'Μαλτέζος Ιωάννης', isMayor: true });
    });

    it('reads who is absent from the subject\'s attendance, and adds an absent member the composition lacks', () => {
        const data = councilWithAbsentPresident();
        const attendance = { present: [member('p1', 'Καραγιάννη Τάνια')], absent: [member('p2', 'Λαμπρόπουλος Παναγιώτης'), member('p3', 'Παπαγιαννάκη Νίκη'), member('y', 'Νέος Υ')] };
        const rollCall = buildSubjectRollCall(data.councilComposition, attendance, 'council', null);
        expect(rollCall.president).toMatchObject({ personId: 'p1', absent: false });
        expect(names(rollCall.present)).toEqual(['Καραγιάννη Τάνια']);
        expect(names(rollCall.absent)).toEqual(['Λαμπρόπουλος Παναγιώτης', 'Παπαγιαννάκη Νίκη', 'Νέος Υ']);
    });

    it('prints the subject\'s own lists and no head line without a composition', () => {
        const attendance = { present: [member('a', 'Α Α'), member('b', 'Β Β')], absent: [member('c', 'Γ Γ')] };
        const rollCall = buildSubjectRollCall(null, attendance, 'council', null);
        expect(rollCall).toMatchObject({ mayor: null, president: null });
        expect(names(rollCall.present)).toEqual(['Α Α', 'Β Β']);
        expect(names(rollCall.absent)).toEqual(['Γ Γ']);
    });
});

describe('formatRollCallMemberLabel', () => {
    const m = (party: string | null, isPartyHead = false): MinutesMember => ({ personId: 'x', name: 'x', party, isPartyHead, role: null });
    it('puts the substitute mark before the party and marks a party head', () => {
        expect(formatRollCallMemberLabel({ member: m('ΝΔ', true), isSubstitute: true, office: null })).toBe('αναπλ. μέλος, ΝΔ, Επικεφαλής');
        expect(formatRollCallMemberLabel({ member: m('ΝΔ'), isSubstitute: false, office: null })).toBe('ΝΔ');
        expect(formatRollCallMemberLabel({ member: m(null), isSubstitute: false, office: null })).toBeNull();
    });

    it('puts an absent president\'s office before the party', () => {
        expect(formatRollCallMemberLabel({ member: m('ΝΔ'), isSubstitute: false, office: { isMayor: true, feminine: true } })).toBe('ΠΡΟΕΔΡΟΣ, ΔΗΜΑΡΧΟΣ, ΝΔ');
        expect(formatRollCallMemberLabel({ member: m(null), isSubstitute: false, office: { isMayor: false, feminine: false } })).toBe('ΠΡΟΕΔΡΟΣ');
    });
});

describe('buildCouncilComposition', () => {
    const makeMember = (personId: string, name: string): MinutesMember => ({
        personId,
        name,
        party: null,
        isPartyHead: false,
        role: null,
    });

    it('includes mayor with personId', () => {
        const members = [makeMember('p1', 'Alice')];
        const mayor = { personId: 'mayor-1', name: 'Dimitris Antoniou' };

        const result = buildCouncilComposition(
            members, [], mayor, null, 'mayor-1', noElectedOrder,
        );

        expect(result.mayor).toEqual({ name: 'Antoniou Dimitris', personId: 'mayor-1', note: null });
    });

    it('includes president with personId', () => {
        const members = [makeMember('p1', 'Alice')];
        const president = { personId: 'pres-1', name: 'Giorgos Papadopoulos' };

        const result = buildCouncilComposition(
            members, [], null, president, null, noElectedOrder,
        );

        expect(result.president).toEqual({ name: 'Papadopoulos Giorgos', personId: 'pres-1' });
    });

    it('excludes mayor from members list', () => {
        const members = [
            makeMember('mayor-1', 'Mayor'),
            makeMember('p1', 'Alice'),
            makeMember('p2', 'Bob'),
        ];

        const result = buildCouncilComposition(
            members, [], null, null, 'mayor-1', noElectedOrder,
        );

        expect(result.members.map(m => m.personId)).toEqual(['p1', 'p2']);
    });

    it('sorts members by elected order', () => {
        const members = [
            makeMember('p3', 'Charlie'),
            makeMember('p1', 'Alice'),
            makeMember('p2', 'Bob'),
        ];
        const electedOrder = makeElectedOrder({ p1: 3, p2: 1, p3: 2 });

        const result = buildCouncilComposition(
            members, [], null, null, null, electedOrder,
        );

        expect(result.members.map(m => m.personId)).toEqual(['p2', 'p3', 'p1']);
    });

    it('handles null mayor and president', () => {
        const members = [makeMember('p1', 'Alice')];

        const result = buildCouncilComposition(
            members, [], null, null, null, noElectedOrder,
        );

        expect(result.mayor).toBeNull();
        expect(result.president).toBeNull();
        expect(result.members).toHaveLength(1);
    });
});

// --- sortSubjectsByDiscussionOrder ---

describe('sortSubjectsByDiscussionOrder', () => {
    function makeSubject(id: string, agendaItemIndex: number | null, opts?: {
        nonAgendaReason?: string | null;
        discussedIn?: { id: string } | null;
    }) {
        return {
            id,
            agendaItemIndex,
            nonAgendaReason: opts?.nonAgendaReason ?? null,
            discussedIn: opts?.discussedIn ?? null,
        };
    }

    it('sorts by first utterance timestamp', () => {
        const subjects = [
            makeSubject('s1', 1),
            makeSubject('s2', 2),
            makeSubject('s3', 3),
        ];
        const timestamps = new Map([['s1', 300], ['s2', 100], ['s3', 200]]);

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(result.map(s => s.id)).toEqual(['s2', 's3', 's1']);
    });

    it('subjects without transcript interleave by agenda position (not pushed to end)', () => {
        const subjects = [
            makeSubject('s1', 1), // no transcript, lower agenda index
            makeSubject('s2', 2), // has transcript
        ];
        const timestamps = new Map([['s2', 100]]);

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        // s1 has lower agenda index, so it goes first despite having no transcript
        expect(result.map(s => s.id)).toEqual(['s1', 's2']);
    });

    it('discussedIn child inherits parent timestamp and sorts after parent', () => {
        const subjects = [
            makeSubject('child', 2, { discussedIn: { id: 'parent' } }),
            makeSubject('parent', 1),
        ];
        const timestamps = new Map([['parent', 100]]);

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(result.map(s => s.id)).toEqual(['parent', 'child']);
    });

    it('outOfAgenda subjects sort after regular agenda items (no transcript)', () => {
        const subjects = [
            makeSubject('ooa', null, { nonAgendaReason: 'outOfAgenda' }),
            makeSubject('agenda', 1),
        ];
        const timestamps = new Map(); // no transcript for either

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(result.map(s => s.id)).toEqual(['agenda', 'ooa']);
    });

    it('subjects without transcript sort by agenda index', () => {
        const subjects = [
            makeSubject('s3', 3),
            makeSubject('s1', 1),
            makeSubject('s2', 2),
        ];
        const timestamps = new Map();

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(result.map(s => s.id)).toEqual(['s1', 's2', 's3']);
    });

    it('multiple outOfAgenda subjects without transcript sort by agenda index fallback', () => {
        const subjects = [
            makeSubject('ooa2', null, { nonAgendaReason: 'outOfAgenda' }),
            makeSubject('ooa1', null, { nonAgendaReason: 'outOfAgenda' }),
        ];
        const timestamps = new Map();

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        // Both have agendaItemIndex null → (null ?? 0) = 0 for both → stable order
        expect(result).toHaveLength(2);
    });

    it('does not mutate input array', () => {
        const subjects = [
            makeSubject('s2', 2),
            makeSubject('s1', 1),
        ];
        const original = [...subjects];
        const timestamps = new Map([['s1', 100], ['s2', 200]]);

        sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(subjects).toEqual(original);
    });

    it('handles empty input', () => {
        const result = sortSubjectsByDiscussionOrder([], new Map());
        expect(result).toEqual([]);
    });

    it('child always inherits parent timestamp, sorted after parent', () => {
        const subjects = [
            makeSubject('child', 2, { discussedIn: { id: 'parent' } }),
            makeSubject('parent', 1),
            makeSubject('other', 3),
        ];
        // child has its own timestamp at 50, but inherits parent's (100)
        const timestamps = new Map([['parent', 100], ['child', 50], ['other', 200]]);

        const result = sortSubjectsByDiscussionOrder(subjects, timestamps);

        // child inherits parent's timestamp (100), sorts after parent, then other at 200
        expect(result.map(s => s.id)).toEqual(['parent', 'child', 'other']);
    });

    it('interleaves no-timestamp subjects by agenda position instead of pushing to end', () => {
        const subjects = [
            makeSubject('s1', 1),
            makeSubject('s2', 2),
            makeSubject('s3', 3),
            makeSubject('s4', 4),
        ];
        const timestamps = new Map([['s1', 100], ['s3', 200]]);

        const sorted = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(sorted.map(s => s.id)).toEqual(['s1', 's2', 's3', 's4']);
    });

    it('places no-timestamp subject with lowest agenda index at the beginning', () => {
        const subjects = [
            makeSubject('s1', 1),  // no timestamp, lowest index
            makeSubject('s3', 3),  // has timestamp
            makeSubject('s5', 5),  // has timestamp
        ];
        const timestamps = new Map([['s3', 100], ['s5', 200]]);

        const sorted = sortSubjectsByDiscussionOrder(subjects, timestamps);

        // s1 has the lowest agenda index — should be first, not last
        expect(sorted.map(s => s.id)).toEqual(['s1', 's3', 's5']);
    });

    it('places no-timestamp regular subject after preceding OOA subjects', () => {
        // ΕΗΔ1 discussed first, then regular items 2-14. Subject 1 has no utterances.
        const subjects = [
            makeSubject('s1', 1),  // no timestamp
            makeSubject('oa1', null, { nonAgendaReason: 'outOfAgenda' }),  // has timestamp (discussed first)
            makeSubject('s2', 2),  // has timestamp
            makeSubject('s3', 3),  // has timestamp
        ];
        const timestamps = new Map([['oa1', 50], ['s2', 100], ['s3', 200]]);

        const sorted = sortSubjectsByDiscussionOrder(subjects, timestamps);

        // s1 should go after oa1 (which was discussed), not before it
        expect(sorted.map(s => s.id)).toEqual(['oa1', 's1', 's2', 's3']);
    });

    it('no-timestamp regular subject does not jump before OOA items between regulars', () => {
        // Discussion order: 1ο, ΕΗΔ1, 5ο. Subject 3ο has no utterances.
        const subjects = [
            makeSubject('s1', 1),
            makeSubject('s3', 3),  // no timestamp
            makeSubject('oa1', null, { nonAgendaReason: 'outOfAgenda' }),
            makeSubject('s5', 5),
        ];
        const timestamps = new Map([['s1', 50], ['oa1', 80], ['s5', 200]]);

        const sorted = sortSubjectsByDiscussionOrder(subjects, timestamps);

        // s3 goes after oa1 (which was discussed between s1 and s5), not before it
        expect(sorted.map(s => s.id)).toEqual(['s1', 'oa1', 's3', 's5']);
    });

    it('places no-timestamp OA subjects after regular subjects', () => {
        const subjects = [
            makeSubject('s1', 1),
            makeSubject('oa1', null, { nonAgendaReason: 'outOfAgenda' }),
        ];
        const timestamps = new Map([['s1', 100]]);

        const sorted = sortSubjectsByDiscussionOrder(subjects, timestamps);

        expect(sorted.map(s => s.id)).toEqual(['s1', 'oa1']);
    });
});

// --- discussionOrderKeys ---

describe('discussionOrderKeys', () => {
    const u = (subjectId: string | null, status: DiscussionStatus | null, startTimestamp: number) =>
        ({ discussionSubjectId: subjectId, discussionStatus: status, startTimestamp, endTimestamp: startTimestamp + 1 });
    const agendaItem = (n: number) => ({ id: `s${n}`, agendaItemIndex: n, nonAgendaReason: null, discussedIn: null });

    it('puts an item stopped part-way and resumed at the end of the meeting last (Sparta may6_2026)', () => {
        // «το θέμα το 5ο πάει τελευταίο προς συζήτηση»: item 5 is opened after
        // item 4, stopped, and resumed and voted after item 14. The page for
        // Τριτάκης reads «προσήλθε στο 10ο θέμα (παρών στα θέματα 10-14 και 5)».
        const rows = (spartaMay6 as { item: number | null; status: DiscussionStatus | null; start: number }[])
            .map(r => u(r.item === null ? null : `s${r.item}`, r.status, r.start));
        const subjects = Array.from({ length: 14 }, (_, i) => agendaItem(i + 1));

        const keys = discussionOrderKeys(rows);
        const ordered = orderedMinutesSubjects(subjects, keys);

        expect(ordered.map(s => s.agendaItemIndex)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 5]);
        // Where the discussion resumes («Κύριε Κακούρο, έχετε ενημέρωση για το
        // θέμα…» at 715.3), not at the vote at 727.9.
        expect(keys.get('s5')).toBeCloseTo(715.29, 2);
    });

    it('places a resumed subject where its discussion resumes, before a subject read inside that discussion', () => {
        // s1 is opened, left pending while s2 is voted, and resumed at 300. s3 is
        // read at 310, inside s1's resumed discussion, and voted after s1.
        const keys = discussionOrderKeys([
            u('s1', 'SUBJECT_DISCUSSION', 100), u('s2', 'SUBJECT_DISCUSSION', 150), u('s2', 'VOTE', 200),
            u('s1', 'SUBJECT_DISCUSSION', 300), u('s3', 'SUBJECT_DISCUSSION', 310), u('s1', 'VOTE', 320), u('s3', 'VOTE', 400),
        ]);
        const ordered = orderedMinutesSubjects([agendaItem(1), agendaItem(2), agendaItem(3)], keys);

        expect(keys.get('s1')).toBe(300);
        expect(ordered.map(s => s.id)).toEqual(['s2', 's1', 's3']);
    });

    it('keeps a subject at its first utterance when no other subject is voted before its own vote', () => {
        // Samothraki jul28_2026: items 5 and 6 are read together and voted in one
        // sentence, tagged to item 5 only. Item 5 still comes first.
        const keys = discussionOrderKeys([
            u('s5', 'SUBJECT_DISCUSSION', 918), u('s6', 'SUBJECT_DISCUSSION', 992), u('s5', 'VOTE', 1088),
        ]);
        expect(keys).toEqual(new Map([['s5', 918], ['s6', 992]]));
    });

    it('keeps a subject voted in its first stretch at its first utterance, whatever is tagged to it later', () => {
        // Sparta aug26_2026: after item 2 is voted, a member says at item 4 that
        // he votes yes «στην προηγούμενη ψηφοφορία», tagged to item 2.
        const keys = discussionOrderKeys([
            u('s2', 'SUBJECT_DISCUSSION', 526), u('s2', 'VOTE', 3083), u('s3', 'VOTE', 3300), u('s2', 'SUBJECT_DISCUSSION', 3584),
        ]);
        expect(keys.get('s2')).toBe(526);
    });

    it('orders a procedural vote only when the subject has nothing else, and an untagged utterance as discussion', () => {
        const keys = discussionOrderKeys([
            u('oa1', 'PROCEDURAL_VOTE', 10), u('s1', null, 50), u('oa1', 'SUBJECT_DISCUSSION', 300), u('w', 'PROCEDURAL_VOTE', 400),
        ]);
        expect(keys).toEqual(new Map([['oa1', 300], ['s1', 50], ['w', 400]]));
    });

    it('does not count a procedural vote of another subject as that subject being decided', () => {
        const keys = discussionOrderKeys([
            u('s1', 'SUBJECT_DISCUSSION', 100), u('oa1', 'PROCEDURAL_VOTE', 150), u('s1', 'VOTE', 200),
        ]);
        expect(keys.get('s1')).toBe(100);
    });
});

// --- sortByElectedOrder ---

describe('discussionOrderLabel', () => {
    const item = (agendaItemIndex: number | null) => ({ agendaItemIndex, nonAgendaReason: null });
    const oa = (agendaItemIndex: number | null) => ({ agendaItemIndex, nonAgendaReason: 'outOfAgenda' });

    it('is null for the natural order: out-of-agenda subjects first, then the agenda by index', () => {
        expect(discussionOrderLabel([oa(null), oa(null), item(1), item(2)])).toBeNull();
        expect(discussionOrderLabel([])).toBeNull();
    });

    it('collapses runs and counts out-of-agenda subjects in the order they were discussed', () => {
        expect(discussionOrderLabel([item(1), item(2), item(4), item(3), oa(7), oa(8)])).toBe('1ο–2ο, 4ο, 3ο, ΕΗΔ1–ΕΗΔ2');
    });

    it('prints no label for an agenda item with no index, and never joins the items around it to a run', () => {
        expect(discussionOrderLabel([item(2), item(null), item(3)])).toBe('2ο, 3ο');
    });
});

describe('discussedElsewhereIds', () => {
    it('lists the sections that hold an utterance tagged to the subject, once each, never the subject itself', () => {
        const cross = new Map([
            ['s5', new Map([['u1', 's6'], ['u2', 's7'], ['u3', 's6']])],
            ['s6', new Map([['u4', 's5']])],
            ['s8', new Map([['u5', 's6']])],
        ]);
        expect(discussedElsewhereIds('s6', cross)).toEqual(['s5', 's8']);
        expect(discussedElsewhereIds('s5', cross)).toEqual(['s6']);
        expect(discussedElsewhereIds('s9', cross)).toEqual([]);
    });
});

describe('sortByElectedOrder', () => {
    const makeMember = (personId: string, name: string): MinutesMember => ({
        personId, name, party: null, isPartyHead: false, role: null,
    });

    it('sorts by elected order ascending', () => {
        const a = makeMember('p1', 'Alice');
        const b = makeMember('p2', 'Bob');
        const electedOrder = makeElectedOrder({ p1: 2, p2: 1 });

        expect(sortByElectedOrder(a, b, electedOrder)).toBeGreaterThan(0);
        expect(sortByElectedOrder(b, a, electedOrder)).toBeLessThan(0);
    });

    it('nulls sort last', () => {
        const a = makeMember('p1', 'Alice'); // no elected order
        const b = makeMember('p2', 'Bob');
        const electedOrder = makeElectedOrder({ p2: 1 });

        expect(sortByElectedOrder(a, b, electedOrder)).toBeGreaterThan(0);
    });

    it('falls back to name when elected orders are equal', () => {
        const a = makeMember('p1', 'Ζωή');
        const b = makeMember('p2', 'Αλέξης');

        expect(sortByElectedOrder(a, b, noElectedOrder)).toBeGreaterThan(0);
        expect(sortByElectedOrder(b, a, noElectedOrder)).toBeLessThan(0);
    });
});

// --- buildDiscussionSummary ---

describe('buildDiscussionSummary', () => {
    const u = (start: number, end: number, status: DiscussionStatus | null) => ({ startTimestamp: start, endTimestamp: end, discussionStatus: status });

    it('sums SUBJECT_DISCUSSION seconds and starts at the first non-procedural utterance', () => {
        const result = buildDiscussionSummary([
            u(10, 20, 'PROCEDURAL_VOTE'),
            u(100, 160, 'SUBJECT_DISCUSSION'),
            u(160, 190, 'SUBJECT_DISCUSSION'),
            u(190, 200, 'VOTE'),
        ]);
        expect(result).toEqual({ kind: 'discussed', seconds: 90, start: 100 });
    });

    it('is voteOnly when the subject has VOTE utterances and no discussion', () => {
        const result = buildDiscussionSummary([u(300, 320, 'VOTE')]);
        expect(result).toEqual({ kind: 'voteOnly', seconds: 0, start: 300 });
    });

    it('is none with no utterances', () => {
        expect(buildDiscussionSummary([])).toEqual({ kind: 'none', seconds: 0, start: null });
    });

    it('is other, placed by the procedural vote, when that is all there is', () => {
        const result = buildDiscussionSummary([u(40, 50, 'PROCEDURAL_VOTE'), u(50, 55, 'PROCEDURAL_VOTE')]);
        expect(result).toEqual({ kind: 'other', seconds: 0, start: 40 });
    });

    it('is other for utterances of ATTENDANCE or OTHER status only', () => {
        const result = buildDiscussionSummary([u(70, 75, 'ATTENDANCE'), u(80, 85, 'OTHER')]);
        expect(result).toEqual({ kind: 'other', seconds: 0, start: 70 });
    });

    it('takes the earliest start even when utterances arrive out of order', () => {
        const result = buildDiscussionSummary([u(500, 510, 'SUBJECT_DISCUSSION'), u(400, 410, 'SUBJECT_DISCUSSION')]);
        expect(result.start).toBe(400);
        expect(result.seconds).toBe(20);
    });
});

// --- buildProceduralVotes ---

describe('buildProceduralVotes', () => {
    const subjects = [
        { id: 's1', name: 'Θέμα 1', agendaItemIndex: 1, nonAgendaReason: null },
        { id: 'oa1', name: 'Κατεπείγον', agendaItemIndex: null, nonAgendaReason: 'outOfAgenda' as const },
        { id: 's5', name: 'Θέμα 5', agendaItemIndex: 5, nonAgendaReason: null },
    ];
    const u = (start: number, status: DiscussionStatus | null, subjectId: string | null) => ({ startTimestamp: start, discussionStatus: status, discussionSubjectId: subjectId });

    it('emits one vote per subject, at its first procedural utterance', () => {
        const result = buildProceduralVotes([
            u(30, 'PROCEDURAL_VOTE', 'oa1'),
            u(35, 'PROCEDURAL_VOTE', 'oa1'),
        ], subjects);
        expect(result).toHaveLength(1);
        expect(result[0].subjectId).toBe('oa1');
        expect(result[0].timestamp).toBe(30);
    });

    it('orders the votes by timestamp', () => {
        const result = buildProceduralVotes([
            u(900, 'PROCEDURAL_VOTE', 's5'),
            u(30, 'PROCEDURAL_VOTE', 'oa1'),
            u(100, 'SUBJECT_DISCUSSION', 's1'),
        ], subjects);
        expect(result.map(v => v.subjectId)).toEqual(['oa1', 's5']);
    });

    it('carries the subject id and the vote time, and nothing else', () => {
        const result = buildProceduralVotes([u(30, 'PROCEDURAL_VOTE', 'oa1')], subjects);
        expect(result).toEqual([{ subjectId: 'oa1', timestamp: 30 }]);
    });

    it('ignores procedural utterances linked to a subject outside the list', () => {
        expect(buildProceduralVotes([u(10, 'PROCEDURAL_VOTE', 'other')], subjects)).toEqual([]);
    });

    it('ignores procedural utterances with no subject', () => {
        expect(buildProceduralVotes([u(10, 'PROCEDURAL_VOTE', null)], subjects)).toEqual([]);
    });
});
