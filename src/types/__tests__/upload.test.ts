import { uploadAccept, uploadAuthorizationScope, uploadFormatOfFile, uploadNameParts, uploadRight } from '../upload';

describe('uploadRight', () => {
    it('asks for records.edit for a decision and for meeting.manage for the files of the meeting', () => {
        expect(uploadRight('decision')).toBe('records.edit');
        expect(uploadRight('agenda')).toBe('meeting.manage');
        expect(uploadRight('recording')).toBe('meeting.manage');
    });
});

describe('uploadAuthorizationScope', () => {
    it('asks for the meeting when the file is for an existing meeting', () => {
        expect(uploadAuthorizationScope({ cityId: 'chania', kind: 'recording', administrativeBodyId: 'youth', councilMeetingId: 'nov5_2026' }))
            .toEqual({ cityId: 'chania', councilMeetingId: 'nov5_2026' });
    });

    it('asks for the body when the meeting does not exist yet', () => {
        expect(uploadAuthorizationScope({ cityId: 'chania', kind: 'agenda', administrativeBodyId: 'youth' }))
            .toEqual({ cityId: 'chania', administrativeBodyId: 'youth' });
    });

    it('asks for the city otherwise', () => {
        expect(uploadAuthorizationScope({ cityId: 'chania', kind: 'agenda', identifier: '2026-10-15' })).toEqual({ cityId: 'chania' });
    });
});

describe('uploadNameParts', () => {
    it('names a file for an existing meeting after that meeting, whatever identifier the caller sent', () => {
        expect(uploadNameParts({ cityId: 'chania', kind: 'recording', identifier: 'other_meeting', councilMeetingId: 'nov5_2026', administrativeBodyId: 'youth' }))
            .toEqual(['chania', 'nov5_2026', 'recording']);
    });

    it('puts the body in the name of a file for a meeting that does not exist yet', () => {
        expect(uploadNameParts({ cityId: 'chania', kind: 'agenda', identifier: 'nov5_2026', administrativeBodyId: 'youth' }))
            .toEqual(['chania', 'youth', 'nov5_2026', 'agenda']);
    });

    it('leaves out an identifier that the config does not give', () => {
        expect(uploadNameParts({ cityId: 'chania', kind: 'decision' })).toEqual(['chania', 'decision']);
    });
});

describe('uploadFormatOfFile', () => {
    it('reads the format from the extension, in any case', () => {
        expect(uploadFormatOfFile('agenda', 'Ημερήσια Διάταξη.PDF')).toBe('pdf');
        expect(uploadFormatOfFile('agenda', 'agenda.v2.docx')).toBe('docx');
        expect(uploadFormatOfFile('recording', 'sitting.MOV')).toBe('mov');
    });

    it('refuses a format that the kind does not take', () => {
        expect(uploadFormatOfFile('agenda', 'agenda.doc')).toBeNull();
        expect(uploadFormatOfFile('decision', 'decision.docx')).toBeNull();
        expect(uploadFormatOfFile('recording', 'sitting.mkv')).toBeNull();
        expect(uploadFormatOfFile('recording', 'sitting')).toBeNull();
    });
});

describe('uploadAccept', () => {
    it('lists the extensions and the content types of the kind', () => {
        expect(uploadAccept('decision')).toBe('.pdf,application/pdf');
        expect(uploadAccept('recording')).toBe('.mp4,video/mp4,.mov,video/quicktime');
    });
});
