import {
    LANDING_DESCRIPTION_PREVIEW_LENGTH,
    toLandingDescriptionPreview,
    toLandingSubjectPreview,
} from './payload';

describe('landing payload previews', () => {
    it('flattens markdown before sending a description to the client', () => {
        expect(toLandingDescriptionPreview('**Important** [decision](REF:UTTERANCE:123)')).toBe(
            'Important decision',
        );
    });

    it('caps long descriptions at the landing-card budget', () => {
        const preview = toLandingDescriptionPreview('council '.repeat(100));

        expect(preview.length).toBeLessThanOrEqual(LANDING_DESCRIPTION_PREVIEW_LENGTH);
        expect(preview).toMatch(/…$/);
    });

    it('keeps the original row immutable and preserves every other field', () => {
        const row = { id: 'subject-1', description: '**Short** summary', cityId: 'athens' };

        expect(toLandingSubjectPreview(row)).toEqual({
            id: 'subject-1',
            description: 'Short summary',
            cityId: 'athens',
        });
        expect(row.description).toBe('**Short** summary');
    });
});
