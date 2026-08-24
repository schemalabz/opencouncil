/**
 * Google Calendar Integration
 *
 * This module mirrors council meetings to the shared OpenCouncil calendar
 * using OAuth 2.0 authentication with a user account.
 */

import { env } from '@/env.mjs';
import { addHours } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { getMeetingForCalendarSync, setMeetingCalendarEventId, MeetingForCalendarSync } from '@/lib/db/meetingsCalendarSync';
import { sendTaskAdminAlert } from '@/lib/discord';

// Bounds each Google API call so a hung request cannot stall the admin
// routes that await the sync (googleapis sets no timeout by default).
const CALENDAR_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Get authenticated Google Calendar API client using OAuth 2.0
 */
async function getCalendarClient() {
    const clientId = env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = env.GOOGLE_CALENDAR_CLIENT_SECRET;
    const refreshToken = env.GOOGLE_CALENDAR_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Google Calendar OAuth credentials are not set. Please configure GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, and GOOGLE_CALENDAR_REFRESH_TOKEN');
    }

    // Dynamic import to avoid loading googleapis in client bundle
    const { google } = await import('googleapis');

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost' // Redirect URI (not used for refresh token flow)
    );

    // Set the refresh token to get access tokens
    oauth2Client.setCredentials({
        refresh_token: refreshToken,
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
}

/**
 * Calculate end time for a meeting (default 2 hours, or custom).
 * addHours adds absolute time. setHours would add wall-clock time in the
 * server's timezone, which gives a wrong end across a DST transition.
 */
function calculateMeetingEndTime(startTime: Date, durationHours: number = 2): Date {
    return addHours(startTime, durationHours);
}

/**
 * Builds the full Google Calendar event body for a meeting. Create and
 * update paths both use this, so every sync rewrites the whole event
 * (title, description, times, attendees).
 */
function buildMeetingEventPayload(meeting: MeetingForCalendarSync) {
    const title = meeting.administrativeBody?.name
        ? `${meeting.city.name}: ${meeting.administrativeBody.name}`
        : meeting.city.name;

    const meetingUrl = `${env.NEXTAUTH_URL}/${meeting.cityId}/${meeting.id}`;
    const descriptionParts: string[] = [];
    if (meeting.agendaUrl) {
        descriptionParts.push(`Ημερήσια Διάταξη: ${meeting.agendaUrl}`);
    }
    descriptionParts.push(meetingUrl);

    const timezone = meeting.city.timezone;
    const endTime = calculateMeetingEndTime(meeting.dateTime);

    // When timeZone is specified, dateTime should be formatted as ISO string in that timezone
    return {
        summary: title,
        description: descriptionParts.join('\n\n'),
        start: {
            dateTime: formatInTimeZone(meeting.dateTime, timezone, "yyyy-MM-dd'T'HH:mm:ss"),
            timeZone: timezone,
        },
        end: {
            dateTime: formatInTimeZone(endTime, timezone, "yyyy-MM-dd'T'HH:mm:ss"),
            timeZone: timezone,
        },
        // Make event public so anyone with the calendar link can see it
        visibility: 'public',
        attendees: meeting.meetingOperator
            ? [{ email: meeting.meetingOperator.user.email }]
            : [],
        // The calendar is public. The operator is on the event only so Google
        // sends them the invite, so keep their address off the guest list that
        // readers of the event can see.
        guestsCanSeeOtherGuests: false,
    };
}

/**
 * Mirrors a meeting to the shared Google Calendar.
 *
 * - Patches the stored event when the meeting has a calendarEventId.
 * - Creates the event (and stores its ID) only when allowCreate is set —
 *   the meeting-creation path — and only for future meetings. Meetings
 *   from before event IDs were stored, and retroactively added past
 *   meetings, are deliberately left alone.
 * - A stored event still gets patched when the meeting is in the past
 *   (a date corrected into the past, late operator bookkeeping), but
 *   with sendUpdates 'none' so nobody is emailed about a meeting that
 *   already happened.
 * - Never throws: calendar sync must not block the triggering request.
 *   Failures are logged and reported to the admin Discord channel,
 *   because a swallowed failure otherwise leaves the calendar silently
 *   out of sync.
 * - Last patch wins. Each sync reads the meeting and then sends the whole
 *   event, with no ordering or version check. Two edits to one meeting
 *   within the same moment can therefore leave the event stale. The
 *   database stays correct, and the next sync of that meeting repairs the
 *   event.
 *
 * sendUpdates 'all' makes Google email the attendees about the change:
 * invites to added attendees, cancellations to removed ones, and update
 * notices on time changes.
 */
export async function syncMeetingToCalendar(
    cityId: string,
    meetingId: string,
    options: { allowCreate?: boolean } = {},
): Promise<void> {
    if (env.GOOGLE_CALENDAR_ENABLED !== 'true') return;
    if (!env.GOOGLE_CALENDAR_ID) return;

    // Both hold what the failure alert reports, so the catch needs them too.
    let meeting: MeetingForCalendarSync | null = null;
    let eventId: string | undefined;

    try {
        meeting = await getMeetingForCalendarSync(cityId, meetingId);
        if (!meeting) {
            console.error(`Calendar sync: meeting ${cityId}/${meetingId} not found`);
            return;
        }
        eventId = meeting.calendarEventId ?? undefined;
        const isPast = meeting.dateTime.getTime() < Date.now();

        const calendar = await getCalendarClient();
        const requestBody = buildMeetingEventPayload(meeting);

        if (meeting.calendarEventId) {
            await calendar.events.patch({
                calendarId: env.GOOGLE_CALENDAR_ID,
                eventId: meeting.calendarEventId,
                requestBody,
                sendUpdates: isPast ? 'none' : 'all',
            }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS });
        } else if (options.allowCreate && !isPast) {
            const response = await calendar.events.insert({
                calendarId: env.GOOGLE_CALENDAR_ID,
                requestBody,
                sendUpdates: 'all',
            }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS });
            eventId = response.data.id ?? undefined;
            if (!eventId) {
                throw new Error('Event created but no ID returned');
            }
            try {
                await setMeetingCalendarEventId(cityId, meetingId, eventId);
            } catch (cause) {
                // Nothing points at the event now, and only the creation path
                // can create one, so it would stay on the public calendar for
                // ever. Delete it, so the meeting and the calendar agree that
                // there is no event.
                let cleanup = 'the event was deleted again';
                try {
                    await calendar.events.delete({
                        calendarId: env.GOOGLE_CALENDAR_ID,
                        eventId,
                        sendUpdates: 'none',
                    }, { timeout: CALENDAR_REQUEST_TIMEOUT_MS });
                } catch {
                    cleanup = 'the event is still on the calendar and an admin must delete it';
                }
                throw new Error(
                    `Created calendar event ${eventId} but failed to store its ID; ${cleanup}.`,
                    { cause },
                );
            }
        }
    } catch (error) {
        console.error(`Failed to sync meeting ${cityId}/${meetingId} to Google Calendar:`, error);
        // sendTaskAdminAlert swallows its own errors, so this cannot throw.
        await sendTaskAdminAlert({
            status: 'failed',
            taskType: 'calendarSync',
            cityName: meeting?.city.name ?? cityId,
            meetingName: meeting?.name ?? meetingId,
            // This alert has no task record. The field carries the calendar
            // event instead, because that is what an admin needs to inspect
            // or delete when a sync fails.
            taskId: eventId ?? 'no calendar event',
            cityId,
            meetingId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
