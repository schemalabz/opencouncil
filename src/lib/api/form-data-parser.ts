import { z } from 'zod';

/**
 * Parse FormData using a Zod schema
 * 
 * FormData entries are always strings (or Files), so this utility:
 * 1. Converts FormData to a plain object
 * 2. Preserves File objects as-is
 * 3. Passes strings to Zod for transformation/validation
 * 
 * @param formData - The FormData object to parse
 * @param schema - The Zod schema to validate against
 * @returns The parsed and validated data
 * @throws {z.ZodError} If validation fails
 */
export async function parseFormData<T extends z.ZodTypeAny>(
  formData: FormData,
  schema: T
): Promise<z.infer<T>> {
  // Convert FormData to plain object for Zod parsing
  const data: Record<string, unknown> = {};
  
  for (const [key, value] of formData.entries()) {
    data[key] = value;
  }
  
  return schema.parse(data);
}

