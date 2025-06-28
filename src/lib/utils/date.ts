export function formatConsultationEndDate(endDate: Date, locale: string = 'el-GR'): string {
    const now = new Date();
    const diffMs = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Format the date with time
    const dateTimeString = endDate.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // Create time ago string
    let timeAgoString = '';

    if (diffDays > 0) {
        if (diffDays === 1) {
            timeAgoString = 'αύριο';
        } else if (diffDays <= 7) {
            timeAgoString = `σε ${diffDays} ημέρες`;
        } else if (diffDays <= 30) {
            const weeks = Math.ceil(diffDays / 7);
            timeAgoString = weeks === 1 ? 'σε 1 εβδομάδα' : `σε ${weeks} εβδομάδες`;
        } else if (diffDays <= 365) {
            const months = Math.ceil(diffDays / 30);
            timeAgoString = months === 1 ? 'σε 1 μήνα' : `σε ${months} μήνες`;
        } else {
            const years = Math.ceil(diffDays / 365);
            timeAgoString = years === 1 ? 'σε 1 χρόνο' : `σε ${years} χρόνια`;
        }
    } else {
        const absDiffDays = Math.abs(diffDays);
        if (absDiffDays === 0) {
            timeAgoString = 'σήμερα';
        } else if (absDiffDays === 1) {
            timeAgoString = 'χθες';
        } else if (absDiffDays <= 7) {
            timeAgoString = `πριν από ${absDiffDays} ημέρες`;
        } else if (absDiffDays <= 30) {
            const weeks = Math.ceil(absDiffDays / 7);
            timeAgoString = weeks === 1 ? 'πριν από 1 εβδομάδα' : `πριν από ${weeks} εβδομάδες`;
        } else if (absDiffDays <= 365) {
            const months = Math.ceil(absDiffDays / 30);
            timeAgoString = months === 1 ? 'πριν από 1 μήνα' : `πριν από ${months} μήνες`;
        } else {
            const years = Math.ceil(absDiffDays / 365);
            timeAgoString = years === 1 ? 'πριν από 1 χρόνο' : `πριν από ${years} χρόνια`;
        }
    }

    return `${dateTimeString} (${timeAgoString})`;
} 