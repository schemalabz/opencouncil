"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

// Cumulative-visible-seconds marks at which a `subject_read` event fires,
// carrying the mark as `milestone_seconds` so funnels can pick their own
// reading threshold (≥30s, ≥60s) without code changes.
const READ_MILESTONES_SECONDS = [30, 60];

// Fires `subject_read` as the subject page accumulates visible time
// (background tabs don't count). Funnels use it as the "actually read a
// subject" activation step — a pageview alone can't distinguish a bounce
// from a read.
export default function SubjectReadTracker({
    cityId,
    meetingId,
    subjectId,
}: {
    cityId: string;
    meetingId: string;
    subjectId: string;
}) {
    useEffect(() => {
        if (!posthog.__loaded) return;

        let visibleSeconds = 0;
        const pending = [...READ_MILESTONES_SECONDS];
        const interval = setInterval(() => {
            if (document.visibilityState !== "visible") return;
            visibleSeconds += 1;
            if (pending.length > 0 && visibleSeconds >= pending[0]) {
                posthog.capture("subject_read", {
                    city_id: cityId,
                    meeting_id: meetingId,
                    subject_id: subjectId,
                    milestone_seconds: pending.shift(),
                });
                if (pending.length === 0) clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [cityId, meetingId, subjectId]);

    return null;
}
