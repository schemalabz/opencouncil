/**
 * Latin→Cyrillic digraph exceptions: words where `nj` or `dž` are two separate
 * letters (н+ј, д+ж) rather than the single letters њ/џ — typically across a
 * prefix boundary (nad-živeti) or in loanwords (in-jekcija). Matched by
 * lowercase prefix so inflected forms are covered (injekcija, injekcije, …).
 * Extend as false fusions are found in real content.
 */
export const EXCEPTION_STEMS: readonly string[] = [
    'injekci', // инјекција — injection
    'injekt', // инјектор
    'injicir', // инјицирати
    'konjug', // конјугација
    'konjunk', // конјункција, конјунктура, конјунктив
    'konjektur', // конјектура
    'tanjug', // Танјуг (Tan + jug, the news agency)
    'nadživ', // надживети — to outlive (nad + živeti)
    'odživ', // одживети
    'odžvak', // оджвакати — to chew through (od + žvakati)
    'podžanr', // поджанр — subgenre
    'podžup', // поджупан — deputy prefect (pod + župan)
    'nadžanr', // наджанр — supergenre
    'anjon', // анјон — anion (an + jon)
    'vanjezič', // ванјезички — extralinguistic
    'vanjugoslov', // ванјугословенски — outside Yugoslavia (van + jugoslovenski)
];

/**
 * Tokens never transliterated Latin→Cyrillic: brand and technical words that
 * happen to consist only of Serbian-valid letters. Lowercase; extensible.
 * (Words containing q/w/x/y or accented letters are skipped automatically and
 * don't need listing.)
 */
export const PROTECTED_WORDS: ReadonlySet<string> = new Set([
    'opencouncil',
    'facebook',
    'instagram',
    'linkedin',
    'google',
    'gmail',
    'github',
    'discord',
    'substack',
    'viber',
    'http',
    'https',
    // Technical tokens/acronyms made only of Serbian-valid letters that must
    // not be converted (ГПС/ПДФ are seen in Serbian, but the digital-platform
    // context here reads better keeping them Latin, and Зоом/Хтмл are wrong).
    'pdf',
    'html',
    'css',
    'api',
    'url',
    'gps',
    'zoom',
    'teams',
    'covid',
    'mail',
    'email',
    'online',
]);
