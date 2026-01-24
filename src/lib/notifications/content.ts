"use server";

import { render } from '@react-email/render';
import { NotificationEmail } from '@/lib/email/templates/NotificationEmail';
import { env } from '@/env.mjs';
import { stripMarkdown } from '@/lib/formatters/markdown';

interface NotificationSubject {
    id: string;
    name: string;
    description: string;
    topic?: {
        name: string;
        colorHex: string;
    } | null;
}

interface NotificationData {
    id: string;
    type: 'beforeMeeting' | 'afterMeeting';
    subjects: NotificationSubject[];
    meeting: {
        dateTime: Date;
        administrativeBody?: {
            name: string;
        } | null;
    };
    city: {
        name_municipality: string;
    };
}

/**
 * Generate HTML email content for a notification
 */
export async function generateEmailContent(notification: NotificationData): Promise<{
    title: string;
    body: string;
}> {
    const meetingDate = new Date(notification.meeting.dateTime);
    const meetingDateFormatted = meetingDate.toLocaleDateString('el-GR');

    const title = `${notification.city.name_municipality}: ${notification.meeting.administrativeBody?.name || 'Συνεδρίαση'} - ${meetingDateFormatted}`;

    const body = await render(
        NotificationEmail({
            type: notification.type,
            meetingDate,
            administrativeBodyName: notification.meeting.administrativeBody?.name || 'Συνεδρίαση',
            cityName: notification.city.name_municipality,
            subjects: notification.subjects.map(subject => ({
                ...subject,
                description: stripMarkdown(subject.description)
            })),
            notificationUrl: `${env.NEXT_PUBLIC_BASE_URL || 'https://opencouncil.gr'}/el/notifications/${notification.id}`
        })
    );

    return { title, body };
}

/**
 * Generate SMS body text for a notification
 */
export async function generateSmsContent(notification: NotificationData): Promise<string> {
    const meetingDate = new Date(notification.meeting.dateTime);
    const meetingDateFormatted = meetingDate.toLocaleDateString('el-GR');
    const subjectCount = notification.subjects.length;

    const adminBody = notification.meeting.administrativeBody?.name || 'συνεδρίαση';
    const notificationUrl = `${env.NEXT_PUBLIC_BASE_URL || 'https://opencouncil.gr'}/el/notifications/${notification.id}`;

    const subjectNames =
        subjectCount > 3
            ? `${notification.subjects.slice(0, 3).map(s => s.name).join(', ')} και άλλα`
            : notification.subjects.map(s => s.name).join(', ');

    return `${notification.city.name_municipality} - ${adminBody} στις ${meetingDateFormatted}: ${subjectCount} νέα θέματα για εσάς. ${subjectNames}. Δείτε περισσότερα: ${notificationUrl}`;
}

