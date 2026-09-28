import { normalizeNonBreakingSpaces, plainTextToCommentHtml } from './commentText';

describe('plainTextToCommentHtml', () => {
    it('wraps paragraphs and keeps single line breaks', () => {
        expect(plainTextToCommentHtml('Πρώτη γραμμή\nδεύτερη\n\nΝέα παράγραφος')).toBe('<p>Πρώτη γραμμή<br>δεύτερη</p><p>Νέα παράγραφος</p>');
    });

    it('escapes markup instead of rendering it', () => {
        expect(plainTextToCommentHtml('<script>x</script> & "a"')).toBe('<p>&lt;script&gt;x&lt;/script&gt; &amp; &quot;a&quot;</p>');
    });

    it('normalises Windows line breaks and drops blank lines', () => {
        expect(plainTextToCommentHtml('α\r\n\r\n\r\n  \r\nβ  ')).toBe('<p>α</p><p>β</p>');
        expect(plainTextToCommentHtml('   \n  ')).toBe('');
    });
});

describe('normalizeNonBreakingSpaces', () => {
    it('turns the old editor\'s non-breaking spaces into spaces', () => {
        expect(normalizeNonBreakingSpaces('<p>Ένα&nbsp;δύο\u00a0τρία</p>')).toBe('<p>Ένα δύο τρία</p>');
    });
});
