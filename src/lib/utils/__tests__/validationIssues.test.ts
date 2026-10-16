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
    it('shows the text of an ErrorResponse', () => {
        expect(apiErrorMessage({ error: 'A topic with this name already exists' }, 'Failed'))
            .toBe('A topic with this name already exists');
    });

    it('shows one line per issue of a ValidationError', () => {
        expect(apiErrorMessage({
            error: [
                { code: 'too_small', path: ['name'], message: 'Name is required' },
                { code: 'invalid_format', path: ['colorHex'], message: 'Invalid color' },
            ],
        }, 'Failed')).toBe('name: Name is required\ncolorHex: Invalid color');
    });

    it('falls back for a body without an error message', () => {
        expect(apiErrorMessage(null, 'Failed')).toBe('Failed');
        expect(apiErrorMessage({ error: { code: 'phone_in_use' } }, 'Failed')).toBe('Failed');
        expect(apiErrorMessage({ error: [] }, 'Failed')).toBe('Failed');
    });
});
