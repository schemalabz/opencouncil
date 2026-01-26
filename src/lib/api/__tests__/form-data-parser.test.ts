import { parseFormData } from '../form-data-parser';
import { z } from 'zod';

describe('parseFormData', () => {
  it('should parse FormData with string values', async () => {
    const formData = new FormData();
    formData.append('name', 'Athens');
    formData.append('age', '30');

    const schema = z.object({
      name: z.string(),
      age: z.string().transform(val => parseInt(val, 10)),
    });

    const result = await parseFormData(formData, schema);
    expect(result.name).toBe('Athens');
    expect(result.age).toBe(30);
  });

  it('should preserve File objects', async () => {
    const formData = new FormData();
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    formData.append('file', file);
    formData.append('name', 'test');

    const schema = z.object({
      file: z.instanceof(File),
      name: z.string(),
    });

    const result = await parseFormData(formData, schema);
    expect(result.file).toBeInstanceOf(File);
    expect(result.file.name).toBe('test.txt');
    expect(result.file.type).toBe('text/plain');
    expect(result.name).toBe('test');
  });

  it('should throw ZodError on validation failure', async () => {
    const formData = new FormData();
    formData.append('age', 'not-a-number');

    const schema = z.object({
      age: z.string().transform(val => {
        const num = parseInt(val, 10);
        if (isNaN(num)) {
          throw new z.ZodError([
            {
              code: 'custom',
              path: ['age'],
              message: 'Invalid number',
            },
          ]);
        }
        return num;
      }),
    });

    await expect(parseFormData(formData, schema)).rejects.toThrow();
  });

  it('should handle empty FormData', async () => {
    const formData = new FormData();
    const schema = z.object({});

    const result = await parseFormData(formData, schema);
    expect(result).toEqual({});
  });

  it('should handle FormData with only File objects', async () => {
    const formData = new FormData();
    const file1 = new File(['content1'], 'file1.txt');
    const file2 = new File(['content2'], 'file2.txt');
    formData.append('file1', file1);
    formData.append('file2', file2);

    const schema = z.object({
      file1: z.instanceof(File),
      file2: z.instanceof(File),
    });

    const result = await parseFormData(formData, schema);
    expect(result.file1).toBeInstanceOf(File);
    expect(result.file2).toBeInstanceOf(File);
    expect(result.file1.name).toBe('file1.txt');
    expect(result.file2.name).toBe('file2.txt');
  });

  it('should handle FormData with only string values', async () => {
    const formData = new FormData();
    formData.append('field1', 'value1');
    formData.append('field2', 'value2');

    const schema = z.object({
      field1: z.string(),
      field2: z.string(),
    });

    const result = await parseFormData(formData, schema);
    expect(result.field1).toBe('value1');
    expect(result.field2).toBe('value2');
  });

  it('should handle mixed File and string values', async () => {
    const formData = new FormData();
    const file = new File(['content'], 'logo.png', { type: 'image/png' });
    formData.append('logo', file);
    formData.append('name', 'Athens');
    formData.append('enabled', 'true');

    const schema = z.object({
      logo: z.instanceof(File),
      name: z.string(),
      enabled: z.string().transform(val => val === 'true'),
    });

    const result = await parseFormData(formData, schema);
    expect(result.logo).toBeInstanceOf(File);
    expect(result.logo.name).toBe('logo.png');
    expect(result.name).toBe('Athens');
    expect(result.enabled).toBe(true);
  });

  it('should handle duplicate keys (last value wins)', async () => {
    const formData = new FormData();
    formData.append('tags', 'tag1');
    formData.append('tags', 'tag2');

    const schema = z.object({
      tags: z.string(), // When iterating entries, last value overwrites previous
    });

    const result = await parseFormData(formData, schema);
    // Our implementation iterates all entries, so last value wins
    expect(result.tags).toBe('tag2');
  });

  it('should handle boolean string transformations', async () => {
    const formData = new FormData();
    formData.append('active', 'true');
    formData.append('disabled', 'false');

    const schema = z.object({
      active: z.string().transform(val => val === 'true'),
      disabled: z.string().transform(val => val === 'true'),
    });

    const result = await parseFormData(formData, schema);
    expect(result.active).toBe(true);
    expect(result.disabled).toBe(false);
  });

  it('should handle optional fields', async () => {
    const formData = new FormData();
    formData.append('required', 'value');

    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });

    const result = await parseFormData(formData, schema);
    expect(result.required).toBe('value');
    expect(result.optional).toBeUndefined();
  });

  it('should handle default values', async () => {
    const formData = new FormData();
    formData.append('name', 'Athens');

    const schema = z.object({
      name: z.string(),
      status: z.string().default('pending'),
    });

    const result = await parseFormData(formData, schema);
    expect(result.name).toBe('Athens');
    expect(result.status).toBe('pending');
  });

  it('should handle nullable fields', async () => {
    const formData = new FormData();
    formData.append('file', 'null'); // FormData sends as string

    const schema = z.object({
      file: z.string().nullable().transform(val => val === 'null' ? null : val),
    });

    const result = await parseFormData(formData, schema);
    expect(result.file).toBeNull();
  });

  it('should preserve empty strings', async () => {
    const formData = new FormData();
    formData.append('empty', '');

    const schema = z.object({
      empty: z.string(),
    });

    const result = await parseFormData(formData, schema);
    expect(result.empty).toBe('');
  });

  it('should handle edge case: empty string with transform', async () => {
    const formData = new FormData();
    formData.append('enabled', '');

    const schema = z.object({
      enabled: z.string().transform(val => val === 'true'),
    });

    const result = await parseFormData(formData, schema);
    expect(result.enabled).toBe(false);
  });

  it('should handle edge case: non-standard boolean strings', async () => {
    const formData = new FormData();
    formData.append('yes', 'yes');
    formData.append('one', '1');
    formData.append('zero', '0');

    const schema = z.object({
      yes: z.string().transform(val => val === 'true'),
      one: z.string().transform(val => val === 'true'),
      zero: z.string().transform(val => val === 'true'),
    });

    const result = await parseFormData(formData, schema);
    // Only 'true' should be true, everything else is false
    expect(result.yes).toBe(false);
    expect(result.one).toBe(false);
    expect(result.zero).toBe(false);
  });
});

