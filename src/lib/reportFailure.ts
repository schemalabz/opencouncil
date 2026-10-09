import "server-only";
import { sendErrorAdminAlert } from '@/lib/discord-core';

/**
 * Log a failure and alert the operators, for work that no task row records
 * and no caller waits for: an image draw, the steps that a meeting write
 * runs after the response, the release that follows a summary. The alert's
 * own failure is logged and never raised, so the caller goes on.
 */
export function reportFailure(source: string, message: string, error: unknown, context: Record<string, string>): void {
    console.error(`${message}:`, error);
    const detail = error instanceof Error ? error.message : String(error);
    sendErrorAdminAlert({ source, error: detail, context })
        .catch((alertError) => console.error(`Failed to send the ${source} alert:`, alertError));
}
