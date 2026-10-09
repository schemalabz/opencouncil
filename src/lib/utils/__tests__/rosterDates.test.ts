import { dayInputValue, rosterDateRequest } from '../rosterDates';

describe('rosterDateRequest', () => {
    it('sends nothing for the default day, so the server keeps its exact moment', () => {
        expect(rosterDateRequest('2026-09-01', '2026-09-01')).toBeUndefined();
    });

    it('sends nothing for an empty input', () => {
        expect(rosterDateRequest('', '2026-09-01')).toBeUndefined();
        expect(rosterDateRequest('', '')).toBeUndefined();
    });

    it('sends the local midnight of another day', () => {
        expect(rosterDateRequest('2026-10-05', '2026-11-17')).toBe(new Date(2026, 9, 5).toISOString());
    });

    it('sends a day when the default is empty', () => {
        expect(rosterDateRequest('2026-10-05', '')).toBe(new Date(2026, 9, 5).toISOString());
    });
});

describe('dayInputValue', () => {
    it('gives the local calendar day, which reads back as the same day', () => {
        const day = new Date(2026, 0, 31, 23, 30);
        expect(dayInputValue(day)).toBe('2026-01-31');
        expect(rosterDateRequest(dayInputValue(day), '')).toBe(new Date(2026, 0, 31).toISOString());
    });
});
