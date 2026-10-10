import * as z from 'zod';
import { BadRequestError } from '@/lib/api/errors';

/** The multipart body of a request. A body that is not form data is a 400, not a 500. */
export async function readFormData(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new BadRequestError('Failed to parse form data');
  }
}

/**
 * Parse FormData with a zod schema. A FormData value is a string or a File,
 * so the schema reads text and transforms it (see `stringBoolean`). A key that
 * appears more than once keeps its last value.
 *
 * @throws {z.ZodError} If validation fails
 */
export function parseFormData<T extends z.ZodType>(formData: FormData, schema: T): z.output<T> {
  return schema.parse(Object.fromEntries(formData.entries()));
}
