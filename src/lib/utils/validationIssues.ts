// One line per issue of a zod validation error, as `path: message`. The API
// returns these issues in the `error` array of a 400 (ValidationError).
export type ValidationIssue = {
    path?: (string | number)[];
    message: string;
};

export function formatValidationIssues(issues: ValidationIssue[]): string[] {
    return issues.map(issue => `${issue.path?.join('.') || 'root'}: ${issue.message}`);
}
