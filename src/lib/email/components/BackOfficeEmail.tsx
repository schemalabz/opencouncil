import * as React from 'react';
import { Text } from '@react-email/components';
import { formatDate } from '@/lib/formatters/time';

/**
 * The parts every email to a body's back office shares (#874): the text and
 * link styles, the contact line, and the subject line. The transcript and the
 * minutes emails read them from here, so the two read as one sender.
 */
export const backOfficeText = {
    color: '#374151',
    fontSize: '16px',
    lineHeight: '24px',
    margin: '24px 0',
} as const;

export const backOfficeLink = { color: '#2563eb', textDecoration: 'underline' } as const;

const contactText = {
    color: '#6b7280',
    fontSize: '13px',
    lineHeight: '20px',
    marginTop: '32px',
    marginBottom: '0',
} as const;

/** The phone line of the realm the meeting's city belongs to. */
export const ContactLine = ({ contactPhone }: { contactPhone: string }): React.ReactElement => (
    <Text style={contactText}>Για ό,τι χρειαστείτε, είμαστε στην διάθεσή σας στο {contactPhone}.</Text>
);

/** "{name}: {body}, {date}", the date in the city's timezone. */
export function documentEmailSubject(name: string, administrativeBodyName: string, meetingDate: Date, timeZone: string): string {
    return `${name}: ${administrativeBodyName}, ${formatDate(meetingDate, timeZone)}`;
}
