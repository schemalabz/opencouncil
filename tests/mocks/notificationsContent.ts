import type { generateEmailContent as realGenerateEmailContent } from '@/lib/notifications/content'

// The real template renders React Email. This body keeps the subject names in
// the order that the caller passed them, so a test can read that order.
export async function generateEmailContent(notification: Parameters<typeof realGenerateEmailContent>[0]) {
    return { title: 'Test', body: notification.subjects.map(({ name }) => name).join('\n') }
}
