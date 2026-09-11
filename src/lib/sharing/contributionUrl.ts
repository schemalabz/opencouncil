import { localePath } from '@/lib/sharing/excerptSelector';

export function contributionSubjectPath(locale: string, cityId: string, meetingId: string, subjectId: string, contributionId: string) {
    const path = localePath(locale, `/${cityId}/${meetingId}/subjects/${subjectId}`);
    return `${path}?${new URLSearchParams({ contribution: contributionId })}#contribution-${encodeURIComponent(contributionId)}`;
}
