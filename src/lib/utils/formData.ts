/**
 * Build the FormData that parseFormData (src/lib/api/form-data-parser.ts)
 * reads back: one entry per field, and no entry for an undefined field. A
 * form passes an object that satisfies the route schema's z.input, so the
 * client and the route cannot drift. It lives apart from the parser because
 * forms run in the browser and the parser imports server code.
 */
export function toFormData(fields: Record<string, string | Blob | undefined>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      formData.append(key, value);
    }
  }
  return formData;
}

