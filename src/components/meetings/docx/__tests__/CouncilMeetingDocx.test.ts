import JSZip from 'jszip';
import { renderDocx } from '../CouncilMeetingDocx';
import { MeetingDataForExport } from '@/lib/export/meetings';
import { roleTitlesFor } from '../../../../../tests/helpers/catalog';

const roleText = roleTitlesFor('el');

const meetingDate = new Date('2024-06-15T18:00:00.000Z');

function councilRole(overrides: Record<string, unknown>) {
    return {
        id: 'role-council',
        personId: 'person-1',
        cityId: null,
        partyId: null,
        party: null,
        administrativeBodyId: 'council',
        administrativeBody: { type: 'council' },
        isHead: false,
        name: null,
        name_en: null,
        startDate: null,
        endDate: null,
        rank: null,
        ...overrides,
    };
}

function makeData(roles: Record<string, unknown>[]): MeetingDataForExport {
    return {
        city: {
            name_municipality: 'Δήμος Ζωγράφου',
            timezone: 'Europe/Athens',
            realm: 'greece',
        },
        meeting: {
            id: 'meeting-1',
            cityId: 'city-1',
            name: 'Τακτική Συνεδρίαση',
            dateTime: meetingDate,
        },
        people: [{
            id: 'person-1',
            name: 'Γιώργος Παπαδόπουλος',
            name_short: 'Γ. Παπαδόπουλος',
            roles,
        }],
        transcript: [{
            id: 'segment-1',
            startTimestamp: 12,
            speakerTag: { personId: 'person-1', label: 'SPEAKER_00' },
            utterances: [{ text: 'Καλησπέρα σας.' }],
        }],
    } as unknown as MeetingDataForExport;
}

async function documentXml(data: MeetingDataForExport): Promise<string> {
    const blob = await (await renderDocx(data, roleText)).save();
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
    return zip.file('word/document.xml')!.async('string');
}

describe('renderDocx speaker line', () => {
    it('labels an independent councillor whose membership role has no name', async () => {
        const xml = await documentXml(makeData([councilRole({})]));

        expect(xml).toContain('Γ. Παπαδόπουλος');
        expect(xml).toContain('>Ανεξάρτητος Δημοτικός Σύμβουλος </w:t>');
        expect(xml).not.toContain('null');
    });

    it('shows the party, not the independent label, for a party member', async () => {
        const party = { id: 'party-1', name: 'Δημοτική Κίνηση', name_short: 'ΔΚ' };
        const xml = await documentXml(makeData([
            councilRole({}),
            councilRole({ id: 'role-party', administrativeBodyId: null, administrativeBody: null, partyId: party.id, party, isHead: true }),
        ]));

        expect(xml).toContain('(ΔΚ, Επικεφαλής)');
        expect(xml).not.toContain('Ανεξάρτητος');
        expect(xml).not.toContain('null');
    });

    it('titles a president whose head role has no name', async () => {
        const party = { id: 'party-1', name: 'Νέα Πορεία', name_short: 'ΝΠ' };
        const xml = await documentXml(makeData([
            councilRole({ isHead: true }),
            councilRole({ id: 'role-party', administrativeBodyId: null, administrativeBody: null, partyId: party.id, party }),
        ]));

        expect(xml).toContain('>Γ. Παπαδόπουλος (ΝΠ) </w:t>');
        expect(xml).toContain('>Πρόεδρος </w:t>');
        expect(xml).not.toContain('null');
    });

    it('shows a named role', async () => {
        const xml = await documentXml(makeData([councilRole({ name: 'Πρόεδρος Δημοτικού Συμβουλίου', isHead: true })]));

        expect(xml).toContain('Πρόεδρος Δημοτικού Συμβουλίου');
    });
});
