import { cyrillicToLatin, latinToCyrillic, toScript } from '@/lib/serbian/transliterate';
import { isSerbianLocale, localizeText, serbianScriptForLocale } from '@/lib/serbian';

describe('cyrillicToLatin', () => {
    it('maps the full lowercase alphabet', () => {
        expect(cyrillicToLatin('абвгдђежзијклљмнњопрстћуфхцчџш')).toBe('abvgdđežzijklljmnnjoprstćufhcčdžš');
    });

    it('maps common words', () => {
        expect(cyrillicToLatin('Београд')).toBe('Beograd');
        expect(cyrillicToLatin('Скупштина града')).toBe('Skupština grada');
        expect(cyrillicToLatin('љубав')).toBe('ljubav');
        expect(cyrillicToLatin('џак')).toBe('džak');
    });

    it('uses title-case digraphs in mixed-case words', () => {
        expect(cyrillicToLatin('Љубљана')).toBe('Ljubljana');
        expect(cyrillicToLatin('Његош')).toBe('Njegoš');
        expect(cyrillicToLatin('Џон')).toBe('Džon');
    });

    it('uses all-caps digraphs when neighbors are uppercase', () => {
        expect(cyrillicToLatin('ЉУБЉАНА')).toBe('LJUBLJANA');
        expect(cyrillicToLatin('ЊЕГОШ')).toBe('NJEGOŠ');
        expect(cyrillicToLatin('ВОЖЊА И ПАЖЊА')).toBe('VOŽNJA I PAŽNJA');
    });

    it('uses all-caps digraph for a trailing uppercase digraph', () => {
        expect(cyrillicToLatin('ФИЛЏ')).toBe('FILDŽ');
    });

    it('uses all-caps digraph at word boundaries mid-string', () => {
        expect(cyrillicToLatin('КОЊ ТРЧИ')).toBe('KONJ TRČI');
        expect(cyrillicToLatin('КОЊ!')).toBe('KONJ!');
        expect(cyrillicToLatin('ЏОРЏ БУШ')).toBe('DŽORDŽ BUŠ');
        expect(cyrillicToLatin('КОЊ\nТРЧИ')).toBe('KONJ\nTRČI');
        expect(cyrillicToLatin('МОДЕЛ-Џ5')).toBe('MODEL-DŽ5');
        // Title-case words keep title-case digraphs across the same boundaries.
        expect(cyrillicToLatin('Џ. Смит')).toBe('Dž. Smit');
    });

    it('leaves Greek, Latin, digits and punctuation untouched', () => {
        expect(cyrillicToLatin('Καλημέρα κόσμε')).toBe('Καλημέρα κόσμε');
        expect(cyrillicToLatin('OpenCouncil 2026, v1.0!')).toBe('OpenCouncil 2026, v1.0!');
    });

    it('preserves ICU message syntax while converting Cyrillic literals', () => {
        const icu = '{count, plural, one {# порука} few {# поруке} other {# порука}}';
        const out = cyrillicToLatin(icu);
        expect(out).toBe('{count, plural, one {# poruka} few {# poruke} other {# poruka}}');
    });
});

describe('latinToCyrillic', () => {
    it('maps common words and sentences', () => {
        expect(latinToCyrillic('Beograd je glavni grad Srbije')).toBe('Београд је главни град Србије');
        expect(latinToCyrillic('Skupština grada')).toBe('Скупштина града');
    });

    it('fuses digraphs', () => {
        expect(latinToCyrillic('ljubav')).toBe('љубав');
        expect(latinToCyrillic('Njegoš')).toBe('Његош');
        expect(latinToCyrillic('džak')).toBe('џак');
        expect(latinToCyrillic('LJUBAV')).toBe('ЉУБАВ');
        expect(latinToCyrillic('NJIVA')).toBe('ЊИВА');
    });

    it('does not fuse dj (only literal đ maps to ђ)', () => {
        expect(latinToCyrillic('odjednom')).toBe('одједном');
        expect(latinToCyrillic('đak')).toBe('ђак');
    });

    it('handles digraph exception words via stems, preserving case', () => {
        expect(latinToCyrillic('injekcija')).toBe('инјекција');
        expect(latinToCyrillic('injekcije')).toBe('инјекције');
        expect(latinToCyrillic('Injekcija')).toBe('Инјекција');
        expect(latinToCyrillic('nadživeti')).toBe('надживети');
        expect(latinToCyrillic('Tanjug')).toBe('Танјуг');
        expect(latinToCyrillic('konjugacija')).toBe('конјугација');
        expect(latinToCyrillic('konjunktura')).toBe('конјунктура');
        expect(latinToCyrillic('podžupan')).toBe('поджупан');
        expect(latinToCyrillic('anjonski')).toBe('анјонски');
        expect(latinToCyrillic('odžvakati')).toBe('оджвакати');
    });

    it('still fuses digraphs in words that merely resemble exception stems', () => {
        expect(latinToCyrillic('tanjir')).toBe('тањир');
        expect(latinToCyrillic('konjica')).toBe('коњица');
        expect(latinToCyrillic('odžačar')).toBe('оџачар');
        expect(latinToCyrillic('budžet')).toBe('буџет');
    });

    it('normalizes NFD input so accented foreign words stay untouched', () => {
        const nfdCafe = 'cafe\u0301'; // café with combining acute (decomposed)
        const nfcCafe = 'caf\u00e9'; // café precomposed
        expect(latinToCyrillic(nfdCafe)).toBe(nfcCafe);
        expect(latinToCyrillic(`Vidimo se u ${nfdCafe}`)).toBe(`\u0412\u0438\u0434\u0438\u043c\u043e \u0441\u0435 \u0443 ${nfcCafe}`);
    });

    it('still fuses digraphs in the non-stem remainder of exception words', () => {
        // konj (коњ) is not an exception; konjunk- is. Sanity-check both.
        expect(latinToCyrillic('konj')).toBe('коњ');
    });

    it('skips tokens with non-Serbian Latin letters', () => {
        expect(latinToCyrillic('Windows')).toBe('Windows');
        expect(latinToCyrillic('taxi')).toBe('taxi');
        expect(latinToCyrillic('New York')).toBe('New York');
        expect(latinToCyrillic('café')).toBe('café');
    });

    it('skips protected brand words', () => {
        expect(latinToCyrillic('OpenCouncil')).toBe('OpenCouncil');
        expect(latinToCyrillic('Facebook')).toBe('Facebook');
    });

    it('leaves URLs and emails untouched but converts surrounding text', () => {
        expect(latinToCyrillic('Pogledajte https://primer.com/lj sada')).toBe('Погледајте https://primer.com/lj сада');
        expect(latinToCyrillic('Pišite na info@primer.com danas')).toBe('Пишите на info@primer.com данас');
        expect(latinToCyrillic('Sajt www.primer.rs radi')).toBe('Сајт www.primer.rs ради');
    });

    it('is a no-op for Greek and for text already in Cyrillic', () => {
        expect(latinToCyrillic('Καλημέρα κόσμε')).toBe('Καλημέρα κόσμε');
        expect(latinToCyrillic('Београд је леп')).toBe('Београд је леп');
    });
});

describe('round-trips', () => {
    it('latin → cyrillic → latin is lossless for Serbian text', () => {
        const samples = ['ljubav', 'Njegoš', 'džak', 'injekcija', 'nadživeti', 'Beograd je glavni grad', 'konjugacija'];
        for (const s of samples) {
            expect(cyrillicToLatin(latinToCyrillic(s))).toBe(s);
        }
    });

    it('cyrillic → latin → cyrillic is lossless for Serbian text', () => {
        const samples = ['љубав', 'Његош', 'џак', 'Београд је главни град', 'Скупштина'];
        for (const s of samples) {
            expect(latinToCyrillic(cyrillicToLatin(s))).toBe(s);
        }
    });
});

describe('locale helpers', () => {
    it('identifies Serbian locales', () => {
        expect(isSerbianLocale('sr')).toBe(true);
        expect(isSerbianLocale('sr-Latn')).toBe(true);
        expect(isSerbianLocale('el')).toBe(false);
        expect(isSerbianLocale('en')).toBe(false);
    });

    it('maps locales to scripts', () => {
        expect(serbianScriptForLocale('sr')).toBe('cyrl');
        expect(serbianScriptForLocale('sr-Latn')).toBe('latn');
        expect(serbianScriptForLocale('fr')).toBeNull();
    });

    it('localizeText is a strict no-op for non-Serbian locales', () => {
        const mixed = 'Δημοτικό συμβούλιο — city council — Beograd';
        expect(localizeText(mixed, 'el')).toBe(mixed);
        expect(localizeText(mixed, 'en')).toBe(mixed);
        expect(localizeText(mixed, 'fr')).toBe(mixed);
    });

    it('localizeText converts to the active Serbian script', () => {
        expect(localizeText('Београд', 'sr-Latn')).toBe('Beograd');
        expect(localizeText('Beograd', 'sr')).toBe('Београд');
        expect(localizeText('Београд', 'sr')).toBe('Београд');
        expect(localizeText('Beograd', 'sr-Latn')).toBe('Beograd');
    });

    it('toScript targets are idempotent', () => {
        expect(toScript(toScript('Београд и Нови Сад', 'latn'), 'latn')).toBe('Beograd i Novi Sad');
        expect(toScript(toScript('Beograd i Novi Sad', 'cyrl'), 'cyrl')).toBe('Београд и Нови Сад');
    });
});
