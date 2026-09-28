import { z } from 'zod';

// Rank of a person in the election result of a body
export const electedOrderSchema = z.number().int().nonnegative().nullable();
