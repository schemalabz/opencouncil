/**
 * One namespace of a message catalog, as a function of a dotted key — outside
 * React, where no component is rendering and no request is in flight.
 *
 * Two callers need authored copy there: the scripts print an issue as a sentence
 * for the meeting checker's report, and the poll request pastes a body's
 * conventions into the extraction prompt. Both walked the catalog with their own
 * copy of the same reduce, and one of them wired ICU formatting by hand on top.
 *
 * next-intl's own `createTranslator` was tried first and does not fit: its `t`
 * is typed against the catalog's literal keys, so a caller holding a key it
 * computes (`issues.messages.${code}`) can only reach it through
 * `as unknown as`, and `renderIssue` is shared with client components that pass
 * their own `t`. The ICU engine below is the one `createTranslator` itself
 * formats with, so the dialect is the same either way.
 *
 * The catalog a caller imports rides into whatever bundle imports the caller, so
 * a module that reads one belongs to the server and the scripts alone.
 */
import { IntlMessageFormat } from 'intl-messageformat';

/** What `renderIssue` and `renderConventionsText` ask of a translator; next-intl's own `t` satisfies it too. */
export type TextResolver = (key: string, values?: Record<string, string | number>) => string;

/** The value at a dotted path, or undefined where the path leaves the catalog. */
function at(root: unknown, key: string): unknown {
    return key.split('.').reduce<unknown>(
        (node, step) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[step] : undefined),
        root);
}

export function catalogText(options: {
    /** The whole catalog, e.g. the parsed `messages/en/admin.json`. */
    messages: Record<string, unknown>;
    /** The subtree keys resolve against, e.g. `decisionsPage`. Dots nest. */
    namespace: string;
    locale?: string;
    /**
     * What a key with no authored message renders as. The key itself makes the
     * gap visible in a report; the empty string lets a caller drop the line
     * rather than print a dotted path into an LLM prompt.
     */
    onMissing?: (key: string) => string;
}): TextResolver {
    const { messages, namespace, locale = 'en', onMissing = key => key } = options;
    const root = at(messages, namespace);
    return (key, values) => {
        const message = at(root, key);
        return typeof message === 'string'
            ? String(new IntlMessageFormat(message, locale).format(values))
            : onMissing(key);
    };
}
