/**
 * Google Calendar Integration
 * 
 * This module provides utilities to create calendar events for council meetings
 * using OAuth 2.0 authentication with a user account.
 */

import { env } from '@/env.mjs';
import { formatInTimeZone } from 'date-fns-tz';

interface CreateCalendarEventParams {
    title: string;
    startTime: Date;
    endTime: Date;
    description?: string;
    timezone: string;
}

interface GoogleCalendarEventResponse {
    id: string;
    htmlLink: string;
}

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
 * Create a calendar event for a council meeting
 */
export async function createMeetingCalendarEvent(params: CreateCalendarEventParams): Promise<GoogleCalendarEventResponse | null> {
    // Skip if calendar integration is disabled
    if (env.GOOGLE_CALENDAR_ENABLED !== 'true') {
        console.log('Google Calendar integration is disabled');
        return null;
    }

    // Skip if calendar ID is not set
    if (!env.GOOGLE_CALENDAR_ID) {
        console.log('Google Calendar ID is not set');
        return null;
    }

    try {
        const calendar = await getCalendarClient();

        // Format dates in the specified timezone for Google Calendar API
        // When timeZone is specified, dateTime should be formatted as ISO string in that timezone
        const startDateTime = formatInTimeZone(params.startTime, params.timezone, "yyyy-MM-dd'T'HH:mm:ss");
        const endDateTime = formatInTimeZone(params.endTime, params.timezone, "yyyy-MM-dd'T'HH:mm:ss");

        const event = {
            summary: params.title,
            description: params.description,
            start: {
                dateTime: startDateTime,
                timeZone: params.timezone,
            },
            end: {
                dateTime: endDateTime,
                timeZone: params.timezone,
            },
            // Make event public so anyone with the calendar link can see it
            visibility: 'public',
        };

        const response = await calendar.events.insert({
            calendarId: env.GOOGLE_CALENDAR_ID,
            requestBody: event,
        });

        if (!response.data.id) {
            throw new Error('Event created but no ID returned');
        }

        console.log('Calendar event created:', {
            eventId: response.data.id,
            link: response.data.htmlLink,
        });

        return {
            id: response.data.id,
            htmlLink: response.data.htmlLink || '',
        };
    } catch (error) {
        console.error('Failed to create calendar event:', error);
        
        // Don't throw error - calendar sync should not block meeting creation
        // Just log it and return null
        return null;
    }
}

/**
 * Calculate end time for a meeting (default 2 hours, or custom)
 */
export function calculateMeetingEndTime(startTime: Date, durationHours: number = 2): Date {
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + durationHours);
    return endTime;
}

