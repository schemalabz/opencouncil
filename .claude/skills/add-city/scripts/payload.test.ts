import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';
import { buildGreek, elot, summary, type GreekRoster, type Payload } from './payload';

// The script has no dependency on the app; this test keeps the Greek builder in step with the schema that populate_city validates with.
function problems(payload: Payload): string[] {
    const parsed = cityPopulationSchema.safeParse(payload);
    return parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
}

const EXAMPLE: GreekRoster = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'references', 'roster.example.json'), 'utf8'));
const example = (): GreekRoster => structuredClone(EXAMPLE);

describe('elot', () => {
    // The project's ELOT 743 profile: μπ→b at the start, mb inside.
    it.each([
        ['Ευάγγελος Παπαδόπουλος', 'Evangelos Papadopoulos'], // ευ before a voiced letter, γγ
        ['Ευστάθιος Λαμπράκης', 'Efstathios Lambrakis'], // ευ before a voiceless letter, medial μπ
        ['Μπάμπης Γιαννόπουλος', 'Bambis Giannopoulos'], // initial μπ
        ['Σταύρος Αυγερινός', 'Stavros Avgerinos'], // accented αύ
        ['Ναυσικά Ευαγγέλου', 'Nafsika Evangelou'],
        ['Άγγελος Αγκυρόπουλος', 'Angelos Agkyropoulos'], // γκ
        ['Χρυσούλα Ψαρρού', 'Chrysoula Psarrou'], // χ, ψ, ου
        ['Θεοδώρα Ξυδάκη', 'Theodora Xydaki'],
        ['Παναγιώτα Κουτσουμπού-Ζαχαρίου', 'Panagiota Koutsoumbou-Zachariou'], // hyphen capitalises
        ['Ηύα Μπακογιάννη', 'Iva Bakogianni'], // ηυ before a vowel
        ['Ταΰγετος Νταής', 'Taygetos Ntais'], // diaeresis breaks the digraph, ντ
        ['Ευτυχία Αυλωνίτη', 'Eftychia Avloniti'], // ευ before τ, αυ before λ
    ])('%s → %s', (gr, en) => expect(elot(gr)).toBe(en));

    it('fills a missing name_en and its short form', () => {
        const spec = example();
        delete spec.mayor.name_en;
        const mayor = buildGreek(spec).payload.people.find(p => p.name === spec.mayor.name)!;
        expect(mayor.name_en).toBe(elot(spec.mayor.name));
        expect(mayor.name_short_en).toBe(`${elot(spec.mayor.name)[0]}. ${elot(spec.mayor.name).split(' ').slice(1).join(' ')}`);
    });
});

/** The roles of one body as comparable rows: person, title, electedOrder, isHead, startDate, endDate. */
function roles(payload: Payload, body: string): string[] {
    return payload.people.flatMap(p => (p.roles ?? []).filter(r => r.administrativeBodyName === body).map(r =>
        JSON.stringify([p.name, r.name ?? null, r.electedOrder ?? null, r.isHead ?? null, r.startDate ?? null, r.endDate ?? null]))).sort();
}
const rows = (...r: unknown[][]) => r.map(x => JSON.stringify(x)).sort();

describe('the Greek conventions on roster.example.json', () => {
    const built = buildGreek(example());

    it('builds without errors and validates as populate_city would', () => {
        expect(built.errors).toEqual([]);
        expect(problems(built.payload)).toEqual([]);
    });

    it('orders the council: presidium, then each faction with its leader first', () => {
        // The secretary's term ended, so she drops to her faction; the mayor leads faction 1 but is no member.
        expect(built.councilOrder).toEqual([
            'Μαρία Πρόεδρου', 'Κωνσταντίνος Αντιπροέδρου',
            'Ιωάννης Αντιδημάρχου', 'Ελένη Μέλους',
            'Νικόλαος Επικεφαλής', 'Δημήτριος Ανεξάρτητος']);
    });

    it('puts the leader first whatever the member order', () => {
        const spec = example();
        const f = spec.factions[1];
        f.members = [...f.members.slice(1), ...f.members.slice(0, 1)];
        expect(buildGreek(spec).councilOrder.slice(-2)).toEqual(['Νικόλαος Επικεφαλής', 'Δημήτριος Ανεξάρτητος']);
    });

    it('gives the council roles', () => {
        expect(roles(built.payload, 'Δημοτικό Συμβούλιο')).toEqual(rows(
            ['Μαρία Πρόεδρου', 'Πρόεδρος', 1, true, '2026-07-02', null],
            ['Κωνσταντίνος Αντιπροέδρου', 'Αντιπρόεδρος', 2, false, '2026-07-02', null],
            ['Ιωάννης Αντιδημάρχου', null, 3, false, null, null],
            ['Ελένη Μέλους', null, 4, false, null, null],
            ['Ελένη Μέλους', 'Γραμματέας', null, false, '2026-07-02', '2026-10-01'],
            ['Νικόλαος Επικεφαλής', null, 5, false, null, null],
            ['Δημήτριος Ανεξάρτητος', null, 6, false, null, null],
        ));
    });

    it('gives the committee roles', () => {
        expect(roles(built.payload, 'Δημοτική Επιτροπή')).toEqual(rows(
            ['Γεώργιος Δημάρχου', 'Πρόεδρος', null, true, '2026-07-06', null],
            ['Νικόλαος Επικεφαλής', 'Αντιπρόεδρος', 1, false, '2026-07-13', null],
            ['Ιωάννης Αντιδημάρχου', null, 2, false, '2026-07-06', null],
            ['Ελένη Μέλους', 'Αναπληρωματικό Μέλος', 3, false, '2026-07-06', null],
            ['Δημήτριος Ανεξάρτητος', 'Αναπληρωματικό Μέλος', 4, false, '2026-07-06', null],
        ));
    });

    it('keeps a committee member who left, and an alternate who took the seat', () => {
        const spec = example();
        const cm = spec.committeeMembers!;
        cm.regulars = [{ name: 'Ιωάννης Αντιδημάρχου', endDate: '2026-08-05' }, 'Νικόλαος Επικεφαλής',
                       { name: 'Ελένη Μέλους', startDate: '2026-08-05' }];
        cm.alternates = [{ name: 'Ελένη Μέλους', endDate: '2026-08-05' }, 'Δημήτριος Ανεξάρτητος'];
        const b = buildGreek(spec);
        expect(b.errors).toEqual([]);
        expect(problems(b.payload)).toEqual([]);
        expect(roles(b.payload, 'Δημοτική Επιτροπή')).toEqual(rows(
            ['Γεώργιος Δημάρχου', 'Πρόεδρος', null, true, '2026-07-06', null],
            ['Νικόλαος Επικεφαλής', 'Αντιπρόεδρος', 1, false, '2026-07-13', null],
            ['Ιωάννης Αντιδημάρχου', null, 2, false, '2026-07-06', '2026-08-05'],
            ['Ελένη Μέλους', null, 3, false, '2026-08-05', null],
            ['Ελένη Μέλους', 'Αναπληρωματικό Μέλος', 4, false, '2026-07-06', '2026-08-05'],
            ['Δημήτριος Ανεξάρτητος', 'Αναπληρωματικό Μέλος', 5, false, '2026-07-06', null],
        ));
    });

    it('passes the Diavgeia units and the channel of a body through, and validates them', () => {
        const spec = example();
        spec.council.diavgeiaUnitIds = ['83734'];
        spec.council.youtubeChannelUrl = 'https://www.youtube.com/@city';
        spec.committee!.diavgeiaUnitIds = ['84655:100010590'];
        const b = buildGreek(spec);
        expect(b.payload.administrativeBodies.map(x => x.diavgeiaUnitIds)).toEqual([['83734'], ['84655:100010590']]);
        expect(b.payload.administrativeBodies.map(x => x.youtubeChannelUrl)).toEqual(['https://www.youtube.com/@city', undefined]);
        expect(summary(b.payload)).toContain('    channel: https://www.youtube.com/@city · Diavgeia units: 83734');
        expect(summary(b.payload)).toContain('    channel: none · Diavgeia units: 84655:100010590');
        expect(problems(b.payload)).toEqual([]);
        spec.council.diavgeiaUnitIds = ['1:2:3'];
        expect(problems(buildGreek(spec).payload)).not.toEqual([]);
    });

    it('keeps the regular seat of a VP whose VP term ended', () => {
        const spec = example();
        const cm = spec.committeeMembers!;
        cm.vicePresident = { name: 'Νικόλαος Επικεφαλής', startDate: '2026-07-13', endDate: '2026-09-01' };
        expect(roles(buildGreek(spec).payload, 'Δημοτική Επιτροπή')).toEqual(expect.arrayContaining(rows(
            ['Νικόλαος Επικεφαλής', 'Αντιπρόεδρος', 1, false, '2026-07-13', '2026-09-01'],
            ['Νικόλαος Επικεφαλής', null, 3, false, '2026-07-06', null],
        )));
    });

    it('keeps isHead on a city role', () => {
        const spec = example();
        spec.cityRoles![0].isHead = true;
        const p = buildGreek(spec).payload.people.find(x => x.name === spec.cityRoles![0].person)!;
        expect(p.roles.find(r => r.name === spec.cityRoles![0].name)).toMatchObject({ type: 'city', isHead: true });
    });

    it('gives party roles, and none to an independent', () => {
        const party = (name: string) => {
            const p = built.payload.people.find(x => x.name === name)!;
            return p.roles.filter(r => r.type === 'party').map(r => [r.partyName, r.isHead]);
        };
        expect(party('Δημήτριος Ανεξάρτητος')).toEqual([]);
        expect(party('Νικόλαος Επικεφαλής')).toEqual([['Δεύτερη Παράταξη', true]]);
        expect(party('Γεώργιος Δημάρχου')).toEqual([['Πρώτη Παράταξη', true]]);
        expect(party('Ελένη Μέλους')).toEqual([['Πρώτη Παράταξη', false]]);
    });
});

describe('the Greek builder stops on', () => {
    const errors = (mutate: (s: GreekRoster) => void) => {
        const spec = example();
        mutate(spec);
        return buildGreek(spec).errors;
    };

    it('a seat count that differs from the members', () => {
        expect(errors(s => { s.seats = 7; })).toContain('6 council members, but the election gives 7 seats');
    });
    it('a leader who is not a member', () => {
        expect(errors(s => { s.factions[1].leader = 'Χ Ψ'; })).toContain('leader Χ Ψ is not a member of Δεύτερη Παράταξη');
    });
    it('a presidium member who is not a council member', () => {
        expect(errors(s => { s.presidium!.president = 'Χ Ψ'; })).toContain('presidium member Χ Ψ is not a council member');
    });
    it('an unknown committee member', () => {
        expect(errors(s => { s.committeeMembers!.alternates.push('Χ Ψ'); })).toContain('committee member Χ Ψ not found');
    });
    it('one person in two presidium posts', () => {
        const e = errors(s => { s.presidium!.vicePresident = s.presidium!.president; });
        expect(e.some(x => x.startsWith('Μαρία Πρόεδρου holds two presidium posts (President, Vice President)'))).toBe(true);
    });
    it('a current committee chair who is also a member', () => {
        expect(errors(s => { s.committeeMembers!.regulars.push('Γεώργιος Δημάρχου'); }))
            .toContain('committee chair Γεώργιος Δημάρχου is also listed as a member');
    });
    it('a committee member listed twice with both entries running today', () => {
        expect(errors(s => { s.committeeMembers!.alternates.push('Ιωάννης Αντιδημάρχου'); }))
            .toContain('committee lists repeat a person who has no endDate in both entries');
    });
    it('but not a chair whose term ended and who stays a member', () => {
        const e = errors(s => { s.committeeMembers!.chair = { name: 'Ιωάννης Αντιδημάρχου', endDate: '2026-09-01' }; });
        expect(e.filter(x => x.includes('chair'))).toEqual([]);
    });
});

describe('the summary of a payload written by hand', () => {
    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2025-09-01T00:00:00Z')));
    afterEach(() => jest.restoreAllMocks());

    // Every country but Greece writes the populate_city payload itself: titles, isHead and
    // dates on any role, a body role included.
    const payload = (): Payload => ({
        cityId: 'exemple',
        parties: [{ name: 'Groupe A', name_en: 'Group A', name_short: 'GA', name_short_en: 'GA', colorHex: '#2563EB', logo: null }],
        administrativeBodies: [{ name: 'Conseil municipal', name_en: 'City Council', type: 'council' }],
        people: [
            { name: 'Anne Martin', name_en: 'Anne Martin', name_short: 'A. Martin', name_short_en: 'A. Martin', image: null, profileUrl: null,
              roles: [{ type: 'city', name: 'Maire', name_en: 'Mayor', isHead: true, startDate: '2026-03-22' },
                      { type: 'adminBody', administrativeBodyName: 'Conseil municipal', name: 'Présidente', name_en: 'Chair', isHead: true,
                        startDate: '2026-03-28', electedOrder: 1 }] },
            { name: 'Paul Durand', name_en: 'Paul Durand', name_short: 'P. Durand', name_short_en: 'P. Durand', image: null, profileUrl: null,
              roles: [{ type: 'party', partyName: 'Groupe A', name: 'Président du groupe', name_en: 'Group president', isHead: true },
                      { type: 'adminBody', administrativeBodyName: 'Conseil municipal', name: null, name_en: null, isHead: false, electedOrder: 2 }] },
        ],
    });

    it('validates as populate_city would', () => {
        expect(problems(payload())).toEqual([]);
    });

    it('prints a titled body role, the city roles and the party leaders', () => {
        const text = summary(payload());
        expect(text).toContain('    1 Anne Martin · independent · Présidente · HEAD from 2026-03-28');
        expect(text).toContain('    2 Paul Durand · Groupe A · member');
        expect(text).toContain('  Anne Martin · Maire / Mayor from 2026-03-22');
        expect(text).toContain('  Groupe A: Paul Durand');
    });

    it('shows the current party and all titled party roles after a group change', () => {
        const spec = payload();
        spec.parties.push({ ...spec.parties[0], name: 'Groupe B', name_en: 'Group B' });
        const person = spec.people[1];
        person.roles![0] = { ...person.roles![0], startDate: '2024-01-01', endDate: '2025-09-01' };
        person.roles!.push({ type: 'party', partyName: 'Groupe B', name: 'Vice-président', name_en: 'Vice president', startDate: '2025-09-01' });
        expect(problems(spec)).toEqual([]);
        const text = summary(spec);
        expect(text).toContain('    2 Paul Durand · Groupe B · member');
        expect(text).toContain('  ENDED Groupe A: Paul Durand · Président du groupe / Group president · HEAD from 2024-01-01 to 2025-09-01');
        expect(text).toContain('  Groupe B: Paul Durand · Vice-président / Vice president from 2025-09-01');
        expect(text).toContain('  Groupe A: NO LEADER');
        expect(text).toContain('  Groupe B: NO LEADER');
    });

    it('does not present an ended or future party leader as current', () => {
        const spec = payload();
        spec.parties.push({ ...spec.parties[0], name: 'Groupe B', name_en: 'Group B' });
        spec.people[1].roles![0].endDate = '2025-09-01';
        spec.people[1].roles!.push({ type: 'party', partyName: 'Groupe B', isHead: true, startDate: '2999-01-01' });
        expect(problems(spec)).toEqual([]);
        const text = summary(spec);
        expect(text).toContain('    2 Paul Durand · independent · member');
        expect(text).toContain('  ENDED Groupe A: Paul Durand');
        expect(text).toContain('  FUTURE Groupe B: Paul Durand');
        expect(text).toContain('  Groupe A: NO LEADER');
        expect(text).toContain('  Groupe B: NO LEADER');
    });

    it('prints schema-valid people without roles through the standalone CLI', () => {
        const spec = payload();
        for (const person of spec.people) delete person.roles;
        expect(problems(spec)).toEqual([]);
        const dir = fs.mkdtempSync(path.join(tmpdir(), 'add-city-payload-'));
        try {
            const file = path.join(dir, 'payload.json');
            fs.writeFileSync(file, JSON.stringify(spec));
            const result = spawnSync(process.execPath, [
                require.resolve('tsx/cli'), path.join(__dirname, 'payload.ts'), file,
            ], { encoding: 'utf8' });
            expect(result.status).toBe(0);
            expect(result.stdout).toContain('2 people, 0 roles');
        } finally {
            fs.rmSync(dir, { recursive: true });
        }
    });
});

describe('the populate_city schema', () => {
    it('reports a role that names a body the payload does not have', () => {
        const { payload } = buildGreek(example());
        payload.people[1].roles.push({ type: 'adminBody', administrativeBodyName: 'Κοινότητα', name: null, name_en: null, isHead: false });
        expect(problems(payload)).toEqual([expect.stringContaining(`${payload.people[1].name}: adminBody role names the unknown body "Κοινότητα"`)]);
    });
});
