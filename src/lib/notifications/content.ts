import "server-only";

import { render } from '@react-email/render';
import { NotificationEmail } from '@/lib/email/templates/NotificationEmail';
import type { Realm } from '@prisma/client';
import { realmBaseUrl } from '@/lib/utils/realmBaseUrl';
import { emailLocaleForRealm } from '@/lib/email/emailLocale';
import { urlPrefixForLocale } from '@/i18n/config';
import { stripMarkdown } from '@/lib/formatters/markdown';
import { buildUnsubscribeUrl } from '@/lib/notifications/tokens';
import { formatNumericDate } from '@/lib/formatters/time';

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
    userId: string;
    cityId: string;
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
        /** Decides the link domain and the language. The caller has the city loaded. */
        realm: Realm;
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
    const meetingDateFormatted = formatNumericDate(meetingDate);

    const title = `${notification.city.name_municipality}: ${notification.meeting.administrativeBody?.name || 'Συνεδρίαση'} - ${meetingDateFormatted}`;

    // Off the record, not getRealm(): a send has no request to read.
    const realm = notification.city.realm;
    const locale = emailLocaleForRealm(realm);
    const unsubscribeUrl = await buildUnsubscribeUrl(notification.userId, {
        cityId: notification.cityId,
        locale,
        realm,
    });

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
            notificationUrl: `${realmBaseUrl(realm)}/${urlPrefixForLocale(locale)}/notifications/${notification.id}`,
            unsubscribeUrl,
        })
    );

    return { title, body };
}

/**
 * Generate SMS body text for a notification
 */
export async function generateSmsContent(notification: NotificationData): Promise<string> {
    const meetingDate = new Date(notification.meeting.dateTime);
    const meetingDateFormatted = formatNumericDate(meetingDate);
    const subjectCount = notification.subjects.length;

    const adminBody = notification.meeting.administrativeBody?.name || 'συνεδρίαση';
    const realm = notification.city.realm;
    const notificationUrl = `${realmBaseUrl(realm)}/${urlPrefixForLocale(emailLocaleForRealm(realm))}/notifications/${notification.id}`;

    const subjectNames =
        subjectCount > 3
            ? `${notification.subjects.slice(0, 3).map(s => s.name).join(', ')} και άλλα`
            : notification.subjects.map(s => s.name).join(', ');

    return `${notification.city.name_municipality} - ${adminBody} στις ${meetingDateFormatted}: ${subjectCount} νέα θέματα για εσάς. ${subjectNames}. Δείτε περισσότερα: ${notificationUrl}`;
}

/**
 * Welcome SMS body
 */
export async function generateWelcomeSmsContent(
    userName: string,
    cityName: string,
): Promise<string> {
    return `Γεια σας ${userName}! Εγγραφήκατε επιτυχώς για ειδοποιήσεις από το OpenCouncil για ${cityName}. Θα λαμβάνετε ενημερώσεις για θέματα που σας αφορούν.`;
}
