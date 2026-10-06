import { uploadAuthorizationScope } from '../upload';

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
