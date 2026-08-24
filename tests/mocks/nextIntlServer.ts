/**
 * `next-intl/server` ships ESM that jest does not transform, so any module
 * whose import graph reaches it fails to load. Integration tests exercise
 * data access, not copy, so translations resolve to their key.
 *
 * The exports here mirror what `src/` actually imports. Add to this list when
 * src starts using another one — the failure otherwise is an opaque
 * "not a function" rather than a missing mapping.
 */
type Translator = ((key: string) => string) & {
    rich: (key: string) => string
    markup: (key: string) => string
    raw: (key: string) => string
    has: (key: string) => boolean
}

function translator(): Translator {
    const t = ((key: string) => key) as Translator
    t.rich = (key: string) => key
    t.markup = (key: string) => key
    t.raw = (key: string) => key
    t.has = () => true
    return t
}

export async function getTranslations() {
    return translator()
}

export async function getLocale() {
    return 'el'
}

export async function getMessages() {
    return {}
}

export function setRequestLocale() {
    // no-op: nothing in an integration test reads the request locale
}

export function getRequestConfig(
    fn: (params: { locale: string }) => unknown
) {
    return fn
}
