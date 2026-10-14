/**
 * The CSV contract between scripts/meeting-lifecycle-report.ts and
 * scripts/meeting-lifecycle-apply.ts. The `current*` columns hold the values
 * that the report read, so the apply script can refuse a row that changed
 * since the review. `review` is empty for a row with nothing to look at, and
 * names what to look at otherwise. The names are read, never written:
 * `storedNameLoses` says what a name still says that no column holds.
 */
export const REPORT_COLUMNS = [
    'cityId', 'id', 'localDate', 'bodyName', 'bodyType',
    'currentName', 'currentNameEn', 'currentStatus', 'currentKind', 'currentUrgent', 'currentSessionNumber', 'currentFormat',
    'brackets', 'storedNameLoses',
    'proposedStatus',
    'proposedKind', 'kindEvidence',
    'proposedUrgent', 'urgentEvidence',
    'proposedSessionNumber', 'sessionNumberEvidence',
    'proposedFormat', 'formatEvidence',
    'invitationDiffers', 'idDateDiffers', 'note', 'review', 'apply',
] as const;

export type ReportRow = Record<(typeof REPORT_COLUMNS)[number], string>;

function quote(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsvLine(row: ReportRow): string {
    return REPORT_COLUMNS.map((column) => quote(row[column])).join(',');
}

/** The scripts refuse a production database unless the operator says so. */
export function assertNotProduction(confirmed: boolean) {
    const url = process.env.DATABASE_URL ?? '';
    if (url.includes('production') && !confirmed) {
        throw new Error('DATABASE_URL points to production. Pass --i-know-this-is-production to continue.');
    }
}
