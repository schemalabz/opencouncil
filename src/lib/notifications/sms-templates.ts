
export interface MeetingSmsParams {
    date: string;
    cityName: string;
    subjectsSummary: string;
    adminBody: string;
}

export interface WelcomeSmsParams {
    userName: string;
    cityName: string;
}

export function renderWelcomeSms(p: WelcomeSmsParams): string {
    return `Γεια σας ${p.userName}! Εγγραφήκατε επιτυχώς για ειδοποιήσεις από το OpenCouncil για ${p.cityName}. Θα λαμβάνετε ενημερώσεις για θέματα που σας αφορούν.`;
}

export function renderBeforeMeetingSms(p: MeetingSmsParams): string {
    return `Συνεδρίαση του ${p.adminBody} του δήμου ${p.cityName} στις ${p.date}. Θέματα: ${p.subjectsSummary}. Δείτε περισσότερα στο opencouncil.gr`;
}

export function renderAfterMeetingSms(p: MeetingSmsParams): string {
    return `Ολοκληρώθηκε η συνεδρίαση του ${p.adminBody} του δήμου ${p.cityName} στις ${p.date}. Δείτε τη συζήτηση στο opencouncil.gr`;
}
