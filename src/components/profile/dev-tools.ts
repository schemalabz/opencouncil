import { IS_DEV } from "@/lib/utils";

/**
 * Whether the development tools card exists at all: in development and on
 * preview deployments. The card and the profile page both ask, so the page
 * knows if its rail has anything under the tabs. A plain module, not the
 * card's own: the card is a client component, and a server page cannot call
 * a function it exports.
 */
export function showsDevelopmentSection(isPreview: boolean): boolean {
    return IS_DEV || isPreview;
}
