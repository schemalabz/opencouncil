/**
 * The first value of a search parameter, as a string.
 *
 * Next hands a page `string | string[] | undefined` for every parameter: a URL
 * may repeat one (`?q=a&q=b`), and a page that declares the value a `string`
 * passes an array on to code that calls string methods on it. A repeated
 * parameter is a URL anyone can build, so the page must not crash on it.
 * `URLSearchParams.get` keeps the first value, and this keeps the same one.
 */
export function firstSearchParam(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] ?? '';
    return value ?? '';
}
