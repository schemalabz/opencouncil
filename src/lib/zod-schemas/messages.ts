import english from '../../../messages/en/validation.json';

/**
 * The custom messages of the schemas that a form shows. Each one has a key in
 * the `validation` catalog namespace (`messages/<locale>/validation.json`).
 *
 * A schema takes `vmsg(key)`: the English text of the key. The issue message
 * therefore stays English everywhere a zod error leaves the app without a
 * reader locale: the API 400 bodies, the MCP tool errors (the MCP SDK formats
 * the issues itself), the OpenAPI spec and the logs. A form translates the
 * English text back to its key, and then to the language of the reader
 * (`useValidationMessage`).
 *
 * A message that only an API caller or an agent reads (a JSON body, an MCP
 * tool argument) stays a plain English string in its schema.
 */
export type ValidationMessageKey = keyof typeof english;

const englishMessages: Record<ValidationMessageKey, string> = english;

export const VALIDATION_NAMESPACE = 'validation';

/** The English text of a validation message, for the `error` of a zod check or schema. */
export function vmsg(key: ValidationMessageKey): string {
    return englishMessages[key];
}

const keyByEnglishText = new Map(
    (Object.entries(englishMessages) as [ValidationMessageKey, string][]).map(([key, text]) => [text, key]),
);

/** The key of an issue message that `vmsg` produced; undefined for any other message. */
export function validationMessageKey(message: string): ValidationMessageKey | undefined {
    return keyByEnglishText.get(message);
}
