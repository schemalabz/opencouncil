import { uploadAuthorizationScope, uploadBaseFilename } from '../upload';

describe('uploadAuthorizationScope', () => {
    it('asks a superadmin when there is no city', () => {
        expect(uploadAuthorizationScope(undefined)).toEqual({});
        expect(uploadAuthorizationScope({ identifier: 'x' })).toEqual({});
    });

    it('asks for the meeting when the file is for an existing meeting', () => {
        expect(uploadAuthorizationScope({ cityId: 'chania', administrativeBodyId: 'youth', councilMeetingId: 'nov5_2026' }))
            .toEqual({ cityId: 'chania', councilMeetingId: 'nov5_2026' });
    });

    it('asks for the body when the meeting does not exist yet', () => {
        expect(uploadAuthorizationScope({ cityId: 'chania', administrativeBodyId: 'youth' }))
            .toEqual({ cityId: 'chania', administrativeBodyId: 'youth' });
    });

    it('asks for the city otherwise', () => {
        expect(uploadAuthorizationScope({ cityId: 'chania', identifier: 'logo' })).toEqual({ cityId: 'chania' });
    });
});

describe('uploadBaseFilename', () => {
    it('names a file for an existing meeting after that meeting, whatever identifier the caller sent', () => {
        expect(uploadBaseFilename({ cityId: 'chania', identifier: 'other_meeting', councilMeetingId: 'nov5_2026', administrativeBodyId: 'youth', suffix: 'recording' }, 'mp4'))
            .toBe('chania_nov5_2026_recording.mp4');
    });

    it('puts the body in the name of a file for a meeting that does not exist yet', () => {
        expect(uploadBaseFilename({ cityId: 'chania', identifier: 'nov5_2026', administrativeBodyId: 'youth', suffix: 'agenda' }, 'pdf'))
            .toBe('chania_youth_nov5_2026_agenda.pdf');
    });

    it('keeps the plain name for a city-scoped file, and gives none without a config', () => {
        expect(uploadBaseFilename({ cityId: 'chania', identifier: 'democrats', suffix: 'logo' }, 'png')).toBe('chania_democrats_logo.png');
        expect(uploadBaseFilename(undefined, 'bin')).toBeNull();
        expect(uploadBaseFilename({}, 'bin')).toBeNull();
    });
});
