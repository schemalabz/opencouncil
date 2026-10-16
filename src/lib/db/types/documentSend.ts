// The shared Prisma shapes of the document sends (#874): the selects of the
// queries in src/lib/db/documentSends.ts and the types derived from them.
import type { Prisma } from '@prisma/client';

export const documentSendSettingSelect = {
    document: true,
    enabled: true,
    enabledAt: true,
    recipientEmails: true,
} satisfies Prisma.DocumentSendSettingSelect;

export type DocumentSendSettingRow = Prisma.DocumentSendSettingGetPayload<{ select: typeof documentSendSettingSelect }>;
