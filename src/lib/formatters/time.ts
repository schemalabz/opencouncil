import { formatDistanceToNow } from 'date-fns';
import { el } from 'date-fns/locale';

/**
 * Formats time in seconds to a human-readable string
 * @param time - Time in seconds
 * @returns Formatted string like "5:30" or "1:23:45"
 */
export function formatTime(time: number): string {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats time in seconds to a fixed HH:MM:SS format
 * Always includes hours, minutes, and seconds padded with zeros
 * @param time - Time in seconds
 * @param showMilliseconds - Whether to include milliseconds (default: false)
 * @returns Formatted string like "00:05:30" or "01:23:45.123"
 */
export function formatTimestamp(time: number, showMilliseconds: boolean = false): string {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = Math.floor((time % 1) * 1000);
  
  const baseTimestamp = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  if (showMilliseconds) {
    return `${baseTimestamp}.${milliseconds.toString().padStart(3, '0')}`;
  }
  
  return baseTimestamp;
}

/**
 * Formats duration in seconds to a human-readable string like "5m 30s"
 * @param seconds - Duration in seconds
 * @returns Formatted string
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Formats duration in milliseconds to a human-readable string like "2d 5h" or "3h 20m" or "45m"
 * @param ms - Duration in milliseconds
 * @returns Formatted string
 */
export function formatDurationMs(ms: number): string {
  if (ms === 0) return '0m';
  
  const totalMinutes = Math.round(ms / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  
  return parts.join(' ');
}

/**
 * Formats a date to a relative time string (e.g., "2 hours ago", "3 days ago")
 * @param date - The date to format
 * @param locale - The locale to use for formatting (defaults to 'el')
 * @returns Formatted relative time string in the specified locale
 */
export function formatRelativeTime(date: Date, locale: string = 'el'): string {
  // Map locale to date-fns locale
  const dateFnsLocale = locale === 'en' ? undefined : el;
  
  return formatDistanceToNow(date, {
    addSuffix: true,
    locale: dateFnsLocale
  });
}

/**
 * Formats a date to a standard string representation
 * @param date - The date to format
 * @param timezone - Optional timezone
 * @returns Formatted date string
 */
export function formatDate(date: Date, timezone?: string): string {
  const options: Intl.DateTimeFormatOptions = { dateStyle: 'long' };

  if (timezone) {
    options.timeZone = timezone;
  }

  if (date instanceof Date) {
    return new Intl.DateTimeFormat('el-GR', options).format(date);
  } else if (typeof date === 'string') {
    return new Intl.DateTimeFormat('el-GR', options).format(new Date(date));
  } else {
    throw new Error(`Invalid date: ${date}`);
  }
}

/**
 * Formats a date and time to a standard string representation
 * @param date - The date to format
 * @param timezone - Optional timezone
 * @returns Formatted date and time string
 */
export function formatDateTime(date: Date, timezone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'long',
    timeStyle: 'short'
  };

  if (timezone) {
    options.timeZone = timezone;
  }

  if (date instanceof Date) {
    return new Intl.DateTimeFormat('el-GR', options).format(date);
  } else if (typeof date === 'string') {
    return new Intl.DateTimeFormat('el-GR', options).format(new Date(date));
  } else {
    throw new Error(`Invalid date: ${date}`);
  }
}

export function formatDateRange(startDate: Date | null, endDate: Date | null, t: any): string {
  if (startDate && endDate) {
    return `${t('from')} ${formatDate(startDate)} ${t('until')} ${formatDate(endDate)}`;
  }
  if (startDate && !endDate) {
    return `${t('from')} ${formatDate(startDate)} ${t('until')} ${t('present')}`;
  }
  if (!startDate && endDate) {
    return `${t('until')} ${formatDate(endDate)}`;
  }
  return '';
}

