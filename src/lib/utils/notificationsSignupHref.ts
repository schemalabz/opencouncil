/**
 * Where an invitation to the notifications leads: the municipality's own
 * signup when the reader is on the page of one that offers it, else the
 * picker. The signup of a municipality without notifications offers only the
 * secondary bodies that a reader may follow, and redirects to the petition
 * when there is none (#829). The header cannot tell which, so that
 * municipality gets the picker too.
 *
 * Kept free of imports: the header renders it on every page.
 */
export function notificationsSignupHref(city?: { id: string; supportsNotifications: boolean } | null): string {
    return city?.supportsNotifications ? `/${city.id}/notifications` : '/notifications';
}
