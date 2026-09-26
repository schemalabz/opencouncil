import type { MinutesData, MinutesMember } from '@/lib/minutes/types';

/**
 * Two meetings whose roll call exercises every line the minutes print before
 * the first subject. The minutes renderers and the decisions page read the
 * same fixtures, so a test on one side cannot drift from the other.
 */

const member = (personId: string, name: string, party: string | null, isPartyHead = false): MinutesMember =>
    ({ personId, name, party, isPartyHead, role: null });

const base = (over: Partial<MinutesData>): MinutesData => ({
    city: { name: 'Άργος', name_municipality: 'Δήμος Άργους-Μυκηνών', timezone: 'Europe/Athens', logoImage: null, realm: 'greece' },
    meeting: { id: 'jul21_2026', cityId: 'argos', name: 'Τακτική Συνεδρίαση', dateTime: '2026-07-21T11:00:00.000Z' },
    administrativeBody: null,
    councilComposition: null,
    absentMembers: null,
    preambleEntries: [],
    attendanceChanges: [],
    attendanceChangesSource: 'diff',
    discussionOrderLabel: null,
    proceduralVotes: [],
    subjects: [],
    epilogueEntries: [],
    ...over,
});

/**
 * A Δημοτική Επιτροπή the mayor presides: one regular member absent, one
 * substitute sitting in. The mayor is a member, so the composition counts them
 * in the member lists like any member, and the president's line names them too.
 */
export const committeeWithSubstitute = (): MinutesData => base({
    administrativeBody: { name: 'Δημοτική Επιτροπή', type: 'committee' },
    councilComposition: {
        mayor: { name: 'Μαλτέζος Ιωάννης', personId: 'mayor', note: null },
        president: { name: 'Μαλτέζος Ιωάννης', personId: 'mayor' },
        members: [
            member('mayor', 'Μαλτέζος Ιωάννης', 'Άργος Πρώτα'),
            member('m1', 'Πετσέλης Χρήστος', 'Άργος Πρώτα', true),
            member('m2', 'Λιόλιος Αντώνης', 'Άργος Πρώτα'),
            member('m3', 'Κολεβέντης Φώτιος', 'Νέα Πνοή'),
        ],
        substituteMembers: [member('s1', 'Δημάκης Γιώργος', 'Άργος Πρώτα')],
    },
    absentMembers: [member('m3', 'Κολεβέντης Φώτιος', 'Νέα Πνοή')],
});

/**
 * A Δημοτικό Συμβούλιο: the mayor on their own line with a note, the president
 * absent and so kept out of the absence sentence, one ordinary absentee.
 */
export const councilWithAbsentPresident = (): MinutesData => base({
    administrativeBody: { name: 'Δημοτικό Συμβούλιο', type: 'council' },
    councilComposition: {
        mayor: { name: 'Ρούσσος Σίμος', personId: 'mayor', note: 'αποχώρησε από το 4ο θέμα' },
        president: { name: 'Καραγιάννη Τάνια', personId: 'p1' },
        members: [
            member('p1', 'Καραγιάννη Τάνια', 'Χαλάνδρι Ανάσα'),
            member('p2', 'Λαμπρόπουλος Παναγιώτης', 'Χαλάνδρι Ανάσα', true),
            member('p3', 'Παπαγιαννάκη Νίκη', null),
        ],
        substituteMembers: [],
    },
    absentMembers: [member('p1', 'Καραγιάννη Τάνια', 'Χαλάνδρι Ανάσα'), member('p2', 'Λαμπρόπουλος Παναγιώτης', 'Χαλάνδρι Ανάσα', true)],
});
