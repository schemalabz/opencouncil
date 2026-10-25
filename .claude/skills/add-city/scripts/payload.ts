/**
 * Build and validate a populate_city payload from a roster.json.
 *
 *   npx tsx --tsconfig tsconfig.json .claude/skills/add-city/scripts/payload.ts <roster.json> [<payload.json>] [--summary]
 *
 * Default output: payload.json next to the roster. --summary prints every role for the
 * checkpoint. The payload is then checked as populate_city checks it (the schema and the
 * role references); the command prints VALID, or each problem, and exits 1 on a problem.
 *
 * The roster's shape picks the convention:
 *  - `factions` (Greece, see references/roster.example.json): this file owns the
 *    conventions, so that every Greek city gets the same shape.
 *    - council electedOrder: presidium 1..3 (President, Vice President, Secretary), then
 *      each faction in the order given (largest first), leader first, then members in the
 *      order given (2023 votes). An independent stays inside the faction it was elected on
 *      ("independent": true): it keeps that position but gets no party.
 *    - council member roles carry no startDate; presidium roles carry the election date.
 *    - committee: chair isHead with no electedOrder; VP 1; then regulars and alternates in
 *      decision order (same as scripts/find-municipal-committee.ts).
 *    - party role per member; the leader gets "Επικεφαλής"/"Leader" with isHead. The mayor
 *      leads the majority and is not a council member; a minority leader must also be listed
 *      in that faction's members.
 *    - mayor: city role "Δήμαρχος"/"Mayor" isHead.
 *    Any officer (president, vicePresident, secretary, chair) may be a name or
 *    {"name", "startDate", "endDate"} when its dates differ from the body's. So may each
 *    committee member: a member who left gets an endDate and keeps the place; a person may be
 *    listed twice when the entries do not both run today (an alternate who took a regular seat:
 *    the alternate entry ends, the regular entry starts that day). `regulars` may include
 *    the VP; the VP is numbered 1 once. The chair may be the mayor or a council
 *    member. `name_en` is optional: the Greek name is transliterated (ELOT 743). `seats`
 *    (optional, from election.ts) is checked against the council members.
 *  - `bodies` (any other country): the roster holds every title in the country's own words
 *    and this file only shapes it. One body per `bodies` entry, whose `members` (in order)
 *    get a plain membership with electedOrder 1..n; one party per `parties` entry, the heads
 *    named in `heads` get their party role with isHead and the given title; `cityRoles` per
 *    person become city roles. `name_en` defaults to `name`: give it when the script is not
 *    Latin.
 *    {
 *      "cityId": "rouen",
 *      "bodies": [{"name": "Conseil municipal", "name_en": "City Council", "type": "council", "youtubeChannelUrl": "https://www.youtube.com/@…", "members": ["…"]}],
 *      "parties": [{"name": "…", "name_en": "…", "name_short": "…", "colorHex": "#…",
 *                   "heads": [{"name": "…", "title": "Président du groupe", "title_en": "Group president"}]}],
 *      "people": [{"name": "…", "name_en": "…", "name_short_en": "…", "profileUrl": "…", "party": "…" | null,
 *                  "cityRoles": [{"name": "…", "name_en": "…", "isHead": false, "startDate": "YYYY-MM-DD" | null, "endDate": "…"}]}]
 *    }
 * A name that matches nobody, a duplicate person and a party that is not in `parties` stop
 * both conventions; the Greek one also stops on one person in two presidium posts and on a
 * current committee chair who is also listed as a member.
 */
import fs from 'fs';
import path from 'path';
import { cityPopulationSchema } from '@/lib/zod-schemas/cityPopulation';

type Role = Record<string, string | number | boolean | null>;
type Person = {
    name: string; name_en: string; name_short: string; name_short_en: string;
    image: null; profileUrl: string | null; roles: Role[];
};
type Party = Record<string, string | null>;
// `youtubeChannelUrl` and (Greece) `diavgeiaUnitIds` ("unit" or "unit:signer") go through to the body as the roster gives them.
type Body = { name: string; name_en: string; type?: string; diavgeiaUnitIds?: string[]; youtubeChannelUrl?: string };
export type Payload = { cityId: string; parties: Party[]; administrativeBodies: Body[]; people: Person[] };

type Officer = string | { name: string; startDate?: string | null; endDate?: string | null };
type CityRole = { person?: string; name: string; name_en: string; isHead?: boolean; startDate?: string | null; endDate?: string | null };
export type GreekRoster = {
    cityId: string;
    seats?: number;
    parties: Party[];
    council: Body;
    committee?: Body;
    mayor: { name: string; name_en?: string; party: string };
    factions: Array<{ party: string; leader?: string; members: Array<{ name: string; name_en?: string; independent?: boolean }> }>;
    presidium?: { startDate?: string; president?: Officer; vicePresident?: Officer; secretary?: Officer };
    committeeMembers?: { startDate: string; chair?: Officer; vicePresident?: Officer; regulars: Officer[]; alternates: Officer[] };
    cityRoles?: Array<CityRole & { person: string }>;
    others?: Array<{ name: string; name_en?: string; roles: CityRole[] }>;
};
export type GenericRoster = {
    cityId: string;
    bodies: Array<{ name: string; name_en: string; type: string; youtubeChannelUrl?: string; members: string[] }>;
    parties: Array<{ name: string; name_en: string; name_short: string; name_short_en?: string; colorHex: string;
                     heads?: Array<{ name: string; title: string; title_en: string }> }>;
    people: Array<{ name: string; name_en?: string; profileUrl?: string | null; party?: string | null; cityRoles?: CityRole[] }>;
};
type Built = { payload: Payload; councilOrder: string[]; errors: string[] };

function short(name: string): string {
    const space = name.indexOf(' ');
    return space < 0 ? name : `${name[0]}. ${name.slice(space + 1)}`;
}

const SINGLE: Record<string, string> = Object.fromEntries(
    [...'αβγδεζηθικλμνξοπρστυφχψωάέήίόύώϊϋΐΰς'].map((c, i) =>
        [c, ['a', 'v', 'g', 'd', 'e', 'z', 'i', 'th', 'i', 'k', 'l', 'm', 'n', 'x', 'o', 'p', 'r', 's', 't', 'y', 'f', 'ch', 'ps', 'o',
             'a', 'e', 'i', 'i', 'o', 'y', 'o', 'i', 'y', 'i', 'y', 's'][i]]),
);
// αυ/ευ/ηυ and μπ depend on the next or previous letter: the loop handles them first.
const PAIRS: Array<[string, string]> = [['ου', 'ou'], ['ού', 'ou'], ['γγ', 'ng'], ['γκ', 'gk'], ['γξ', 'nx'], ['γχ', 'nch'], ['ντ', 'nt']];
const VOICELESS = new Set('θκξπστφχψ');
const isLetter = (c: string) => /\p{L}/u.test(c);

/** Greek to Latin per ELOT 743, for a name_en the roster leaves out. One project rule
 * differs from strict ELOT 743: medial μπ is "mb" (gr.md, Names). */
export function elot(s: string): string {
    const low = s.normalize('NFC').toLowerCase();
    const out: string[] = [];
    let i = 0;
    while (i < low.length) {
        const two = low.slice(i, i + 2);
        if (['αυ', 'ευ', 'ηυ', 'αύ', 'εύ', 'ηύ'].includes(two)) {
            const next = low.slice(i + 2, i + 3);
            const base = ({ α: 'a', ε: 'e', η: 'i' } as Record<string, string>)[two[0]];
            out.push(base + (next === '' || VOICELESS.has(next) || !isLetter(next) ? 'f' : 'v'));
            i += 2;
            continue;
        }
        if (two === 'μπ') {
            out.push(i === 0 || !isLetter(low[i - 1]) ? 'b' : 'mb');
            i += 2;
            continue;
        }
        const hit = PAIRS.find(([gr]) => low.startsWith(gr, i));
        if (hit) {
            out.push(hit[1]);
            i += hit[0].length;
            continue;
        }
        out.push(SINGLE[low[i]] ?? low[i]);
        i += 1;
    }
    // These separators give the name_en values that the cities already imported carry.
    return out.join('').replace(/(^|[\s\x1c-\x1f\x85\-–])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

function person(name: string, nameEn: string | undefined): Person {
    const en = nameEn || elot(name);
    return { name, name_en: en, name_short: short(name), name_short_en: short(en), image: null, profileUrl: null, roles: [] };
}

/** A person's party is the party of their party role; an independent has none. */
const partyOf = (p: Person) => (p.roles.find(r => r.type === 'party')?.partyName as string | undefined) ?? null;

/** An officer is a name, or {"name", "startDate", "endDate"} when its dates differ from the body's. */
function officer(x: Officer, defaultStart: string | null | undefined): [string, string | null, string | null] {
    if (typeof x === 'string') return [x, defaultStart ?? null, null];
    return [x.name, 'startDate' in x ? x.startDate ?? null : defaultStart ?? null, x.endDate ?? null];
}

function dated(role: Role, start: string | null, end: string | null): Role {
    role.startDate = start;
    if (end) role.endDate = end;
    return role;
}

function cityRole(r: CityRole, isHead: boolean): Role {
    const role: Role = { type: 'city', name: r.name, name_en: r.name_en, isHead, startDate: r.startDate ?? null };
    if (r.endDate) role.endDate = r.endDate;
    return role;
}

const PRESIDIUM: Array<[keyof NonNullable<GreekRoster['presidium']>, string, string, boolean, number]> = [
    ['president', 'Πρόεδρος', 'President', true, 1],
    ['vicePresident', 'Αντιπρόεδρος', 'Vice President', false, 2],
    ['secretary', 'Γραμματέας', 'Secretary', false, 3],
];

export function buildGreek(spec: GreekRoster): Built {
    const errors: string[] = [];
    const partyNames = spec.parties.map(p => p.name);
    const council = spec.council.name;
    const committee = spec.committee?.name;
    const bodies: Body[] = [{ ...spec.council, type: 'council' }];
    if (spec.committee) bodies.push({ ...spec.committee, type: 'committee' });

    const people = new Map<string, Person>();
    const order: Array<[number, number, number, number, string]> = [];

    const m = spec.mayor;
    if (!partyNames.includes(m.party)) errors.push(`mayor party not in parties: ${m.party}`);
    const mayor = person(m.name, m.name_en);
    mayor.roles.push({ type: 'city', name: 'Δήμαρχος', name_en: 'Mayor', isHead: true },
                     { type: 'party', partyName: m.party, name: 'Επικεφαλής', name_en: 'Leader', isHead: true });
    people.set(m.name, mayor);

    const pres = spec.presidium ?? {};
    const presRoles = new Map<string, { gr: string; en: string; head: boolean; pos: number; start: string | null; end: string | null }>();
    for (const [key, gr, en, head, pos] of PRESIDIUM) {
        const holder = pres[key] as Officer | undefined;
        if (!holder) continue;
        const [name, start, end] = officer(holder, pres.startDate);
        const held = presRoles.get(name);
        if (held) errors.push(`${name} holds two presidium posts (${held.en}, ${en}); the builder keeps one post per person: give the current one and record the other in sources.md`);
        presRoles.set(name, { gr, en, head, pos, start, end });
    }

    const councilRoles = new Map<string, Role>();
    spec.factions.forEach((f, fi) => {
        if (!partyNames.includes(f.party)) errors.push(`faction party not in parties: ${f.party}`);
        const leader = f.leader;
        if (leader && leader !== m.name && !f.members.some(x => x.name === leader)) errors.push(`leader ${leader} is not a member of ${f.party}`);
        f.members.forEach((mem, rank) => {
            const n = mem.name;
            if (people.has(n)) {
                errors.push(`duplicate person ${n}`);
                return;
            }
            const independent = mem.independent ?? false;
            const p = person(n, mem.name_en);
            const isLeader = n === leader;
            if (!independent) {
                p.roles.push({ type: 'party', partyName: f.party, name: isLeader ? 'Επικεφαλής' : null,
                               name_en: isLeader ? 'Leader' : null, isHead: isLeader });
            }
            const cr: Role = { type: 'adminBody', administrativeBodyName: council, name: null, name_en: null, isHead: false, electedOrder: null };
            const post = presRoles.get(n);
            const endedOfficer = Boolean(post?.end);
            if (post && !endedOfficer) Object.assign(cr, { name: post.gr, name_en: post.en, isHead: post.head, startDate: post.start });
            p.roles.push(cr);
            if (post && endedOfficer) {
                // An ended officer keeps a plain member role (ending it would drop the person from
                // the council) and gets the officer title as a separate dated role.
                p.roles.push(dated({ type: 'adminBody', administrativeBodyName: council, name: post.gr, name_en: post.en,
                                     isHead: post.head, electedOrder: null }, post.start, post.end));
            }
            councilRoles.set(n, cr);
            people.set(n, p);
            order.push([post && !endedOfficer ? post.pos : 99, fi, isLeader ? 0 : 1, rank, n]);
        });
    });
    for (const n of presRoles.keys()) {
        if (!councilRoles.has(n)) errors.push(`presidium member ${n} is not a council member`);
    }
    if (spec.seats && order.length !== spec.seats) errors.push(`${order.length} council members, but the election gives ${spec.seats} seats`);
    order.sort((a, b) => {
        for (let k = 0; k < 4; k++) if (a[k] !== b[k]) return (a[k] as number) - (b[k] as number);
        return a[4] < b[4] ? -1 : a[4] > b[4] ? 1 : 0;
    });
    order.forEach(([, , , , n], i) => { councilRoles.get(n)!.electedOrder = i + 1; });

    const cm = spec.committeeMembers;
    if (cm) {
        if (!committee) errors.push('committeeMembers given without a committee body');
        const vp = cm.vicePresident ? officer(cm.vicePresident, cm.startDate) : null;
        type Seat = { name: string; start: string | null; end: string | null; title: 'vp' | 'regular' | 'alternate' };
        const seat = (x: Officer, title: Seat['title']): Seat => {
            const [name, start, end] = officer(x, cm.startDate);
            return { name, start, end, title };
        };
        const seq: Seat[] = [
            ...(vp ? [{ name: vp[0], start: vp[1], end: vp[2], title: 'vp' as const }] : []),
            // A current VP listed among the regulars is numbered once, as the VP. A VP whose
            // term ended keeps the regular seat as its own entry.
            ...cm.regulars.map(x => seat(x, 'regular')).filter(x => !(vp && !vp[2] && x.name === vp[0])),
            ...cm.alternates.map(x => seat(x, 'alternate')),
        ];
        const open = seq.filter(x => !x.end).map(x => x.name);
        if (new Set(open).size !== open.length) errors.push('committee lists repeat a person who has no endDate in both entries');
        if (cm.chair) {
            const [chair, cStart, cEnd] = officer(cm.chair, cm.startDate);
            if (open.includes(chair) && !cEnd) errors.push(`committee chair ${chair} is also listed as a member`);
            const p = people.get(chair);
            if (!p) errors.push(`committee chair ${chair} not found`);
            else p.roles.push(dated({ type: 'adminBody', administrativeBodyName: committee ?? null, name: 'Πρόεδρος', name_en: 'Chair', isHead: true }, cStart, cEnd));
        }
        seq.forEach((x, i) => {
            const p = people.get(x.name);
            if (!p) {
                errors.push(`committee member ${x.name} not found`);
                return;
            }
            p.roles.push(dated({
                type: 'adminBody', administrativeBodyName: committee ?? null,
                name: x.title === 'vp' ? 'Αντιπρόεδρος' : x.title === 'alternate' ? 'Αναπληρωματικό Μέλος' : null,
                name_en: x.title === 'vp' ? 'Vice President' : x.title === 'alternate' ? 'Alternate Member' : null,
                isHead: false, electedOrder: i + 1,
            }, x.start, x.end));
        });
    }

    for (const r of spec.cityRoles ?? []) {
        const p = people.get(r.person);
        if (!p) {
            errors.push(`city role for unknown person ${r.person}`);
            continue;
        }
        p.roles.push(cityRole(r, r.isHead ?? false));
    }

    for (const o of spec.others ?? []) {
        if (people.has(o.name)) {
            errors.push(`duplicate person ${o.name}`);
            continue;
        }
        const p = person(o.name, o.name_en);
        for (const r of o.roles) p.roles.push(cityRole(r, r.isHead ?? false));
        people.set(o.name, p);
    }

    const payload: Payload = { cityId: spec.cityId, parties: spec.parties, administrativeBodies: bodies, people: [...people.values()] };
    return { payload, councilOrder: order.map(o => o[4]), errors };
}

export function buildGeneric(roster: GenericRoster): Built {
    const errors: string[] = [];
    const names = roster.people.map(p => p.name);
    const known = new Set(names);
    if (known.size !== names.length) {
        errors.push(`duplicate people: ${[...new Set(names.filter((n, i) => names.indexOf(n) !== i))].join(', ')}`);
    }
    const partyNames = new Set(roster.parties.map(p => p.name));
    const heads = new Map<string, { name: string; title: string; title_en: string }>();
    const headKey = (party: string, name: string) => `${party}\u0000${name}`;
    for (const party of roster.parties) {
        for (const h of party.heads ?? []) {
            if (!known.has(h.name)) errors.push(`head ${h.name} of ${party.name} is not a person`);
            heads.set(headKey(party.name, h.name), h);
        }
    }
    for (const body of roster.bodies) {
        for (const m of body.members) if (!known.has(m)) errors.push(`member ${m} of ${body.name} is not a person`);
    }
    for (const p of roster.people) {
        if (p.party && !partyNames.has(p.party)) errors.push(`${p.name}: unknown party ${p.party}`);
    }
    for (const party of roster.parties) {
        for (const h of party.heads ?? []) {
            const member = roster.people.find(p => p.name === h.name);
            if (member && member.party !== party.name) errors.push(`head ${h.name} of ${party.name} is in party ${member.party ?? null}`);
        }
    }

    const people = new Map<string, Person>();
    for (const p of roster.people) {
        const en = p.name_en ?? p.name;
        const built: Person = { name: p.name, name_en: en, name_short: short(p.name), name_short_en: short(en), image: null, profileUrl: p.profileUrl ?? null, roles: [] };
        for (const r of p.cityRoles ?? []) {
            built.roles.push({ type: 'city', name: r.name, name_en: r.name_en, isHead: Boolean(r.isHead),
                               startDate: r.startDate ?? null, endDate: r.endDate ?? null });
        }
        if (p.party) {
            const h = heads.get(headKey(p.party, p.name));
            built.roles.push({ type: 'party', partyName: p.party, name: h ? h.title : null, name_en: h ? h.title_en : null,
                               isHead: Boolean(h), startDate: null, endDate: null });
        }
        people.set(p.name, built);
    }
    for (const body of roster.bodies) {
        body.members.forEach((m, i) => {
            people.get(m)?.roles.push({ type: 'adminBody', administrativeBodyName: body.name, name: null, name_en: null,
                                        isHead: false, startDate: null, endDate: null, electedOrder: i + 1 });
        });
    }
    const payload: Payload = {
        cityId: roster.cityId,
        parties: roster.parties.map(p => ({ name: p.name, name_en: p.name_en, name_short: p.name_short,
                                            name_short_en: p.name_short_en ?? p.name_short, colorHex: p.colorHex, logo: null })),
        administrativeBodies: roster.bodies.map(b => ({ name: b.name, name_en: b.name_en, type: b.type,
                                                      ...(b.youtubeChannelUrl ? { youtubeChannelUrl: b.youtubeChannelUrl } : {}) })),
        people: [...people.values()],
    };
    const council = roster.bodies.find(b => b.type === 'council');
    return { payload, councilOrder: council ? council.members : [], errors };
}

const dates = (r: Role) => [r.startDate && `from ${r.startDate}`, r.endDate && `to ${r.endDate}`].filter(Boolean).join(' ');
const byFirstThenName = <T extends [number | boolean, string]>(a: T, b: T) =>
    Number(a[0]) - Number(b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);

/** Every role, grouped, for the checkpoint presentation. */
export function summary(payload: Payload, electedOn: Map<string, string> = new Map()): string {
    const lines: string[] = [];
    for (const body of payload.administrativeBodies) {
        const rows: Array<[number, string, string | null, Role]> = [];
        for (const p of payload.people) {
            for (const r of p.roles) if (r.administrativeBodyName === body.name) rows.push([(r.electedOrder as number | null) ?? 0, p.name, partyOf(p), r]);
        }
        lines.push(`\n### ${body.name} (${body.type}, ${rows.length} roles)`);
        lines.push(`    channel: ${body.youtubeChannelUrl ?? 'none'}${body.diavgeiaUnitIds ? ` · Diavgeia units: ${body.diavgeiaUnitIds.join(', ')}` : ''}`);
        rows.sort((a, b) => byFirstThenName([a[0], a[1]], [b[0], b[1]]));
        for (const [o, n, party, r] of rows) {
            const title = r.name || (body.type === 'council' ? 'member' : 'regular member');
            const who = party || (electedOn.has(n) ? `independent (elected on ${electedOn.get(n)})` : 'independent');
            lines.push(`  ${String(o || '-').padStart(3)} ${n} · ${who} · ${title}${r.isHead ? ' · HEAD' : ''} ${dates(r)}`.trimEnd());
        }
    }
    lines.push('\n### City roles (current, then ENDED)');
    const city: Array<[boolean, string, string, Role]> = payload.people.flatMap(p =>
        p.roles.filter(r => r.type === 'city').map(r => [Boolean(r.endDate), r.name as string, p.name, r] as [boolean, string, string, Role]));
    city.sort((a, b) => byFirstThenName([a[0], a[1]], [b[0], b[1]]));
    for (const [ended, , n, r] of city) lines.push(`  ${ended ? 'ENDED ' : ''}${n} · ${r.name} / ${r.name_en} ${dates(r)}`.trimEnd());
    lines.push('\n### Party leaders');
    const led = new Set<string>();
    for (const p of payload.people) {
        for (const r of p.roles) {
            if (r.type === 'party' && r.isHead) {
                lines.push(`  ${r.partyName}: ${p.name}`);
                led.add(r.partyName as string);
            }
        }
    }
    for (const party of payload.parties) if (!led.has(party.name as string)) lines.push(`  ${party.name}: NO LEADER`);
    return lines.join('\n');
}

/** The problems populate_city would refuse the payload for: its schema, which also checks that each role names a party or body of the payload. */
export function validate(payload: Payload): string[] {
    const parsed = cityPopulationSchema.safeParse(payload);
    return parsed.success ? [] : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
}

function build(roster: GreekRoster | GenericRoster): Built {
    return 'factions' in roster ? buildGreek(roster) : buildGeneric(roster);
}

function main(argv: string[]) {
    const args = argv.filter(a => !a.startsWith('--'));
    if (!args[0]) {
        console.error('usage: payload.ts <roster.json> [<payload.json>] [--summary]');
        process.exit(2);
    }
    const rosterPath = args[0];
    const out = args[1] ?? path.join(path.dirname(path.resolve(rosterPath)), 'payload.json');
    const roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8')) as GreekRoster | GenericRoster;
    const { payload, councilOrder, errors } = build(roster);
    if (errors.length) {
        for (const e of errors) console.error('ERROR', e);
        process.exit(1);
    }
    fs.writeFileSync(out, JSON.stringify(payload, null, 1));
    const roles = payload.people.reduce((sum, p) => sum + p.roles.length, 0);
    console.log(`${out}: ${payload.people.length} people, ${councilOrder.length} council members, ${roles} roles`);
    councilOrder.forEach((n, i) => console.log(`  ${String(i + 1).padStart(2)} ${n}`));
    if (argv.includes('--summary')) {
        const electedOn = new Map('factions' in roster
            ? roster.factions.flatMap(f => f.members.filter(x => x.independent).map(x => [x.name, f.party] as [string, string]))
            : []);
        console.log(summary(payload, electedOn));
    }
    const problems = validate(payload);
    if (problems.length) {
        for (const p of problems) console.log(p);
        process.exit(1);
    }
    console.log('VALID');
}

if (require.main === module) main(process.argv.slice(2));
