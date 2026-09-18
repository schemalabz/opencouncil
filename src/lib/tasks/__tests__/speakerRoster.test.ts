import { buildSpeakerRoster } from '../speakerRoster';
import { PersonWithRelations } from '@/lib/db/people';

type Role = PersonWithRelations['roles'][number];

const role = (over: Partial<Role>): Role => ({
    id: 'role', personId: 'p', cityId: null, partyId: null, administrativeBodyId: null, isHead: false,
    name: null, name_en: null, electedOrder: null, startDate: null, endDate: null,
    createdAt: new Date(0), updatedAt: new Date(0), party: null, administrativeBody: null, city: null,
    ...over,
} as Role);

const bodyRole = (id: string, bodyName: string, over: Partial<Role> = {}) =>
    role({ administrativeBodyId: id, administrativeBody: { id, name: bodyName } as Role['administrativeBody'], ...over });
const partyRole = (name: string, over: Partial<Role> = {}) =>
    role({ partyId: 'party', party: { id: 'party', name } as Role['party'], ...over });

const person = (id: string, name: string, roles: Role[]) => ({ id, name, roles } as PersonWithRelations);

const MEETING_DATE = new Date('2026-09-14T07:30:00Z');

describe('buildSpeakerRoster', () => {
    it('lists the roles in the meeting body first, then the others', () => {
        const [chair] = buildSpeakerRoster([person('p1', 'Γ. Γιάνναρος', [
            role({ cityId: 'athens', name: 'Αντιδήμαρχος' }),
            bodyRole('council', 'Δημοτικό Συμβούλιο'),
            bodyRole('committee', 'Δημοτική Επιτροπή', { name: 'Πρόεδρος', isHead: true }),
            partyRole('Αθήνα Τώρα'),
        ])], MEETING_DATE, 'committee');

        expect(chair).toEqual({
            id: 'p1',
            name: 'Γ. Γιάνναρος',
            role: 'Πρόεδρος, Δημοτική Επιτροπή; Αντιδήμαρχος; Δημοτικό Συμβούλιο',
            party: 'Αθήνα Τώρα',
            memberOfMeetingBody: true,
        });
    });

    it('marks a party head, and an unnamed head of a body', () => {
        const [head] = buildSpeakerRoster([person('p1', 'Κ. Ζαχαριάδης', [
            bodyRole('council', 'Δημοτικό Συμβούλιο', { isHead: true }),
            partyRole('Ανοιχτή Πόλη', { isHead: true }),
        ])], MEETING_DATE, 'council');

        expect(head.role).toBe('head, Δημοτικό Συμβούλιο');
        expect(head.party).toBe('Ανοιχτή Πόλη (head)');
    });

    it('ignores roles that are not active on the meeting date', () => {
        const [former] = buildSpeakerRoster([person('p1', 'Παλιός Σύμβουλος', [
            bodyRole('council', 'Δημοτικό Συμβούλιο', { endDate: new Date('2023-12-31') }),
            partyRole('Παλιά Παράταξη', { startDate: new Date('2027-01-01') }),
        ])], MEETING_DATE, 'council');

        expect(former).toEqual({ id: 'p1', name: 'Παλιός Σύμβουλος', role: null, party: null, memberOfMeetingBody: false });
    });

    it('counts nobody as a member when the meeting has no body', () => {
        const [member] = buildSpeakerRoster([person('p1', 'Α. Β.', [bodyRole('council', 'Δημοτικό Συμβούλιο')])], MEETING_DATE, null);
        expect(member.memberOfMeetingBody).toBe(false);
        expect(member.role).toBe('Δημοτικό Συμβούλιο');
    });

    it('returns people in a stable order', () => {
        const roster = buildSpeakerRoster([person('p2', 'Βασίλης', []), person('p1', 'Άννα', []), person('p3', 'Άννα', [])], MEETING_DATE, null);
        expect(roster.map(p => p.id)).toEqual(['p1', 'p3', 'p2']);
    });
});
