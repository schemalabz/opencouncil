/**
 * OpenCouncil Feature Configuration
 *
 * This file controls feature flags and configuration for the application.
 * Update these values to enable/disable features without changing environment variables.
 */

export interface HiringConfig {
    /** Whether to show the hiring badge (replaces Substack badge when true) */
    readonly enabled: boolean;
    /** Job posting URL */
    readonly url: string;
    /** Display text for the hiring badge */
    readonly text: string;
}

/**
 * Hiring banner configuration
 *
 * Set enabled to true to show the hiring badge in the header bar.
 * This will replace the Substack post badge when active.
 */
export const HIRING_CONFIG: HiringConfig = {
    enabled: true, // Set to false to show Substack badge instead
    url: 'https://schemalabs.gr/jobs/civic-tech-software-engineer',
    text: 'Προσλαμβάνουμε developer!'
} as const;
