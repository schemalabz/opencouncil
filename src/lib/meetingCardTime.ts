import { format, formatDistance, parseISO, isValid } from 'date-fns';
import { el, enUS } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';

export type MeetingCardTimeLocale = 'el' | 'en';

type DateValue = Date | string;

export interface MeetingCardTemporalState {
  isUpcoming: boolean;
  isToday: boolean;
  isTodayWithoutVideo: boolean;
  upcomingDistance: string | null;
}

interface GetMeetingCardTemporalStateInput {
  meetingDate: DateValue;
  meetingHasVideo: boolean;
  referenceNow: DateValue;
  locale: MeetingCardTimeLocale;
  cityTimezone?: string;
}

function toDate(value: DateValue): Date {
  if (value == null) {
    throw new RangeError(`Invalid date value: ${value}`);
  }
  const date = value instanceof Date ? value : parseISO(value);
  if (!isValid(date)) {
    throw new RangeError(`Invalid date value: ${value}`);
  }
  return date;
}

export function getMeetingCardTemporalState({
  meetingDate,
  meetingHasVideo,
  referenceNow,
  locale,
  cityTimezone,
}: GetMeetingCardTemporalStateInput): MeetingCardTemporalState {
  const meetingDateValue = toDate(meetingDate);
  const referenceNowValue = toDate(referenceNow);

  const isUpcoming = meetingDateValue.getTime() > referenceNowValue.getTime();
  const formatDateKey = (value: Date): string =>
    cityTimezone
      ? formatInTimeZone(value, cityTimezone, 'yyyy-MM-dd')
      : format(value, 'yyyy-MM-dd');
  const isToday = formatDateKey(meetingDateValue) === formatDateKey(referenceNowValue);

  return {
    isUpcoming,
    isToday,
    isTodayWithoutVideo: isToday && !meetingHasVideo,
    upcomingDistance: isUpcoming
      ? formatDistance(meetingDateValue, referenceNowValue, {
        locale: locale === 'el' ? el : enUS,
        addSuffix: true,
      })
      : null,
  };
}
