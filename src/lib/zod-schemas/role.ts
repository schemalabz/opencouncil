import { z } from 'zod';

// Rank of a person in the election result of a body
export const electedOrderSchema = z.number().int().nonnegative().nullable();

// A blank title is no title: a plain member has a role without a name.
export const roleTitleSchema = z.string().nullable().optional().transform(value => value?.trim() || null);
