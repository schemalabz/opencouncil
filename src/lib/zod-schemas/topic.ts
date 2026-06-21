import { z } from 'zod';
import { Realm } from '@prisma/client';
import { HEX_REGEX } from '@/lib/utils/colorSuggestion';

const trimmedString = z.string().transform(val => val.trim());

const baseTopicFields = {
    name: trimmedString.pipe(z.string().min(1, "name is required")),
    name_en: trimmedString.pipe(z.string().min(1, "name_en is required")),
    colorHex: z.string().regex(HEX_REGEX, "colorHex must be a valid hex color"),
    description: z.string(),
    icon: z.string().nullable().optional().transform(val => val || null),
    deprecated: z.boolean().optional().transform(val => val ?? false),
    realm: z.nativeEnum(Realm),
};

export const createTopicSchema = z.object(baseTopicFields);

// All fields optional for partial updates — absent fields stay undefined.
export const updateTopicSchema = z.object(baseTopicFields).partial();

export type CreateTopicData = z.infer<typeof createTopicSchema>;
export type UpdateTopicData = z.infer<typeof updateTopicSchema>;
