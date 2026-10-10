import { apiErrorMessage, formatValidationIssues } from '@/lib/utils/validationIssues';

describe('formatValidationIssues', () => {
    it('writes one line per issue with its path', () => {
        expect(formatValidationIssues([
            { path: ['people', 3, 'name_short'], message: 'Short name must be at least 2 characters.' },
            { path: [], message: 'Required' },
        ])).toEqual([
            'people.3.name_short: Short name must be at least 2 characters.',
            'root: Required',
        ]);
    });
});

describe('apiErrorMessage', () => {
    it('shows the text of an ErrorResponse that a route wrote for the request', () => {
        expect(apiErrorMessage({ error: 'A topic with this name already exists' }, 409, 'Failed'))
            .toBe('A topic with this name already exists');
        expect(apiErrorMessage({ error: 'Every role must be on an administrative body you administer.' }, 400, 'Failed'))
            .toBe('Every role must be on an administrative body you administer.');
        expect(apiErrorMessage({ error: 'The meeting already happened.', code: 'pastMeeting' }, 422, 'Failed'))
            .toBe('The meeting already happened.');
    });

    it('shows the fallback for the text of a 401, a 403 or a 5xx', () => {
        expect(apiErrorMessage({ error: 'Authentication required' }, 401, 'Αποτυχία')).toBe('Αποτυχία');
        expect(apiErrorMessage({ error: 'Not authorized' }, 403, 'Αποτυχία')).toBe('Αποτυχία');
        expect(apiErrorMessage({ error: 'Failed to update city' }, 500, 'Αποτυχία')).toBe('Αποτυχία');
    });

    it('shows one line per issue of a ValidationError', () => {
        expect(apiErrorMessage({
            error: [
                { code: 'too_small', path: ['name'], message: 'Name is required' },
                { code: 'invalid_format', path: ['colorHex'], message: 'Invalid color' },
            ],
        }, 400, 'Failed')).toBe('name: Name is required\ncolorHex: Invalid color');
    });

    it('turns the message of each issue through formatMessage', () => {
        expect(apiErrorMessage({
            error: [{ code: 'too_small', path: ['name'], message: 'nameRequired' }],
        }, 400, 'Failed', message => `localized:${message}`)).toBe('name: localized:nameRequired');
    });

    it('falls back for a body without an error message', () => {
        expect(apiErrorMessage(null, 400, 'Failed')).toBe('Failed');
        expect(apiErrorMessage({ error: { code: 'phone_in_use' } }, 400, 'Failed')).toBe('Failed');
        expect(apiErrorMessage({ error: [] }, 400, 'Failed')).toBe('Failed');
        expect(apiErrorMessage({ error: '' }, 400, 'Failed')).toBe('Failed');
    });
});
