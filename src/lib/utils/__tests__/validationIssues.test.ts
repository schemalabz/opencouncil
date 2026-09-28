import { formatValidationIssues } from '../validationIssues';

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
