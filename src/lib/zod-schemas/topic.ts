import * as z from 'zod';
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
    realm: z.enum(Realm),
};

export const createTopicSchema = z.object(baseTopicFields);

/**
 * The form of a topic label that two labels must not share: the MCP search
 * resolves a label to a topic by it, so two topics of a realm with the same
 * key would hide one another.
 */
export function topicLabelKey(label: string): string {
    return label.trim().toLowerCase();
}

/** The keys a topic is found by: its name and its English name. */
export function topicLabelKeys(topic: { name: string; name_en: string }): string[] {
    return [...new Set([topicLabelKey(topic.name), topicLabelKey(topic.name_en)])];
}

// All fields optional for partial updates — absent fields stay undefined.
export const updateTopicSchema = z.object(baseTopicFields).partial();
