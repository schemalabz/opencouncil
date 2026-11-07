import type { Prisma } from '@prisma/client';

export type TopicInput = Pick<Prisma.TopicCreateInput, 'name' | 'name_en' | 'colorHex' | 'icon' | 'description' | 'deprecated' | 'realm'>;

/** A topic of a realm that the caller names: the realm comes once, and a new topic is never deprecated. */
export type RealmTopicInput = Omit<TopicInput, 'realm' | 'deprecated'>;

export const createdTopicSelect = { id: true, name: true, name_en: true } satisfies Prisma.TopicSelect;
export type CreatedTopic = Prisma.TopicGetPayload<{ select: typeof createdTopicSelect }>;

export const existingTopicSelect = { id: true, name: true, name_en: true, deprecated: true } satisfies Prisma.TopicSelect;
export type ExistingTopic = Prisma.TopicGetPayload<{ select: typeof existingTopicSelect }>;
