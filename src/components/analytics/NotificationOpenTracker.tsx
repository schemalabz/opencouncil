"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Fires `notification_opened` when a notification page is viewed. The page
// URL (/notifications/{id}) carries no city, so pageviews alone can't
// attribute notification opens to a municipality — this event carries the
// city explicitly, mirroring `subject_read`.
export default function NotificationOpenTracker({
    notificationId,
    cityId,
    meetingId,
    notificationType,
    subjectCount,
}: {
    notificationId: string;
    cityId: string;
    meetingId: string;
    notificationType: string;
    subjectCount: number;
}) {
    useEffect(() => {
        if (!posthog.__loaded) return;
        posthog.capture("notification_opened", {
            notification_id: notificationId,
            city_id: cityId,
            meeting_id: meetingId,
            notification_type: notificationType,
            subject_count: subjectCount,
        });
    }, [notificationId, cityId, meetingId, notificationType, subjectCount]);

    return null;
}
