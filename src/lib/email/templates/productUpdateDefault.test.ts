/** @jest-environment jsdom */
import DOMPurify from 'dompurify';
import { SANITIZE_CONFIG } from './productUpdateDefault';

describe('SANITIZE_CONFIG image support', () => {
    it('keeps an img with src, alt, width, height and style', () => {
        const html =
            '<img src="https://cdn.example.com/a.png" alt="hi" width="600" height="300" style="max-width:100%;height:auto;display:block;">';
        const out = DOMPurify.sanitize(html, SANITIZE_CONFIG);
        expect(out).toContain('<img');
        expect(out).toContain('src="https://cdn.example.com/a.png"');
        expect(out).toContain('alt="hi"');
        expect(out).toContain('width="600"');
        expect(out).toContain('style="max-width:100%;height:auto;display:block;"');
    });

    it('strips a javascript: src', () => {
        const out = DOMPurify.sanitize('<img src="javascript:alert(1)">', SANITIZE_CONFIG);
        expect(out).not.toContain('javascript:');
    });

    it('strips an onerror handler', () => {
        const out = DOMPurify.sanitize(
            '<img src="https://cdn.example.com/a.png" onerror="alert(1)">',
            SANITIZE_CONFIG,
        );
        expect(out).not.toContain('onerror');
    });
});
