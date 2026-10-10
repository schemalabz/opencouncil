import * as z from 'zod';
import { NotificationType } from '@prisma/client';

export const notificationTypeSchema = z.enum(NotificationType);

/**
 * How much a subject matters to the notifications of its meeting: through its
 * topic, and through the distance from its location to the places of a
 * reader. The Subject columns store the same values as text.
 */
export const subjectImportanceSchema = z.object({
    topicImportance: z.enum(['doNotNotify', 'normal', 'high']).default('doNotNotify'),
    proximityImportance: z.enum(['none', 'near', 'wide']).default('none'),
});

export type SubjectImportance = z.output<typeof subjectImportanceSchema>;

/** The importance of each subject that the admin sets, by subject id. */
const subjectImportancesSchema = z.record(z.string(), subjectImportanceSchema).default({});

// JSON body of POST /api/cities/{cityId}/meetings/{meetingId}/notifications
export const createMeetingNotificationsRequestSchema = z.object({
    type: notificationTypeSchema,
    subjectImportances: subjectImportancesSchema,
    sendImmediately: z.boolean().default(false),
});

// JSON body of POST /api/cities/{cityId}/meetings/{meetingId}/notifications/preview
export const notificationImpactPreviewRequestSchema = z.object({
    subjectImportances: subjectImportancesSchema,
});

// JSON body of POST /api/admin/notifications/release
export const releaseNotificationsRequestSchema = z.object({
    notificationIds: z.array(z.string().min(1)).min(1),
});
