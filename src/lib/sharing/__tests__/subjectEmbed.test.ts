import { parseSubjectEmbedTarget, subjectEmbedSnippet, subjectEmbedUrl, SUBJECT_EMBED_HEIGHT } from '../subjectEmbed';

describe('public subject embed URLs', () => {
    const target = { cityId: 'city', meetingId: 'old_2020', subjectId: 'subject' };
    it('creates explicit locale URLs from an exact target with no inherited parameters', () => {
        const url = subjectEmbedUrl('https://pr-4.opencouncil.dev/previous?t=100', 'sr-Latn', target, 'dark');
        expect(url).toBe('https://pr-4.opencouncil.dev/lat/embed/subject?cityId=city&meetingId=old_2020&subjectId=subject&mode=dark');
        expect(subjectEmbedUrl('http://localhost:3101', 'el', target, 'light')).toContain('/el/embed/subject?');
    });
    it('escapes copied HTML attributes and uses the preview height', () => {
        const html = subjectEmbedSnippet('https://example.test/?a=1&b="x"', 'Discussion <test> "title"');
        expect(html).toContain('&amp;b=&quot;x&quot;');
        expect(html).toContain('Discussion &lt;test&gt; &quot;title&quot;');
        expect(html).toContain(`height="${SUBJECT_EMBED_HEIGHT}"`);
        expect(html).not.toContain('scrolling="no"');
    });
    it('rejects missing, repeated and malformed source identities', () => {
        expect(parseSubjectEmbedTarget(target)).toEqual(target);
        expect(parseSubjectEmbedTarget({ ...target, subjectId: undefined })).toBeNull();
        expect(parseSubjectEmbedTarget({ ...target, meetingId: ['a', 'b'] })).toBeNull();
        expect(parseSubjectEmbedTarget({ ...target, cityId: '../secret' })).toBeNull();
    });
});
