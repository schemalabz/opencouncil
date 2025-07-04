import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { formatDistanceToNow } from 'date-fns';
import { el } from 'date-fns/locale';

export function formatConsultationEndDate(endDate: Date, cityTimezone: string, locale: string = 'el-GR'): string {
    // The endDate from database should be interpreted as city timezone, but JavaScript treats it as UTC
    // We need to extract the time components and treat them as if they're in the city timezone

    // Use UTC methods to get the "raw" time components from the database
    const year = endDate.getUTCFullYear();
    const month = String(endDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(endDate.getUTCDate()).padStart(2, '0');
    const hours = String(endDate.getUTCHours()).padStart(2, '0');
    const minutes = String(endDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(endDate.getUTCSeconds()).padStart(2, '0');

    const dateTimeString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

    // Now treat this as city timezone and convert to proper UTC
    const correctDate = fromZonedTime(dateTimeString, cityTimezone);

    // Format the date in city timezone (should show the original database time)
    const formattedDateTime = formatInTimeZone(correctDate, cityTimezone, 'dd MMM yyyy, HH:mm');

    // Use date-fns to get proper relative time formatting with Greek locale
    const relativeTime = formatDistanceToNow(correctDate, {
        addSuffix: true,
        locale: el
    });

    return `${formattedDateTime} (${relativeTime})`;
} 