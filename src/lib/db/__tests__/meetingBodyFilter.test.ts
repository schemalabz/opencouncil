import { meetingBodyTypeWhere } from '../meetingBodyFilter';

describe('meetingBodyTypeWhere', () => {
    // Cities imported before bodies existed hold meetings with no body, and the
    // app reads such a meeting as the council's.
    it('admits a meeting with no body when the types include the council', () => {
        expect(meetingBodyTypeWhere(['council', 'committee'])).toEqual({
            OR: [
                { administrativeBody: { type: { in: ['council', 'committee'] } } },
                { administrativeBodyId: null },
            ],
        });
    });

    it('filters on the body type alone when the council is not asked for', () => {
        expect(meetingBodyTypeWhere(['community'])).toEqual({ administrativeBody: { type: { in: ['community'] } } });
    });
});
