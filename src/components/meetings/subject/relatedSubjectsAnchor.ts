/**
 * The DOM id the header strip scrolls to. subject.tsx puts it on the wrapper
 * around the section's slot, outside the section's error boundary, so the
 * strip's link has a target even when the section fails after the strip has
 * rendered. Its own module, so a page that imports the id does not take the
 * whole section into its client graph for one string.
 */
export const RELATED_SUBJECTS_ID = 'related-subjects';
