/**
 * Fetch and release pending notifications for a specific meeting
 * Returns the result from the release API call
 */
export async function releaseNotificationsForMeeting(
    meetingId: string,
    cityId: string
): Promise<{ success: boolean; emailsSent?: number; messagesSent?: number; error?: string }> {
    try {
        // Fetch notifications for this meeting
        const res = await fetch(
            `/api/admin/notifications?meetingId=${meetingId}&cityIdForMeeting=${cityId}`
        );
        const data = await res.json();
        const notifications = data.notifications || [];

        // Get IDs of notifications with pending deliveries
        const pendingNotificationIds = notifications
            .filter((n: any) => n.deliveries.some((d: any) => d.status === 'pending'))
            .map((n: any) => n.id);

        if (pendingNotificationIds.length === 0) {
            return { success: true, emailsSent: 0, messagesSent: 0 };
        }

        // Release the notifications
        const releaseRes = await fetch('/api/admin/notifications/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationIds: pendingNotificationIds })
        });

        if (!releaseRes.ok) {
            return { success: false, error: 'Release API call failed' };
        }

        const result = await releaseRes.json();
        return {
            success: true,
            emailsSent: result.emailsSent || 0,
            messagesSent: result.messagesSent || 0
        };
    } catch (error) {
        console.error(`Error releasing notifications for meeting ${meetingId}:`, error);
        return { success: false, error: String(error) };
    }
}

/**
 * Parse a meeting key string into cityId and meetingId
 */
export function parseMeetingKey(key: string): { cityId: string; meetingId: string } {
    const [cityId, meetingId] = key.split('-');
    return { cityId, meetingId };
}

/**
 * Create a meeting key from cityId and meetingId
 */
export function createMeetingKey(cityId: string, meetingId: string): string {
    return `${cityId}-${meetingId}`;
}
