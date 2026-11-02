/**
 * The pages of the /admin tree that stay a superadmin's (#875): they span
 * every realm, or hold no city at all. A realm admin opens every other page.
 * The sidebar hides these pages, and the proxy turns a realm admin away from
 * them. The pages and their APIs keep their own guards.
 */
export const SUPERADMIN_ADMIN_PAGES: ReadonlySet<string> = new Set([
    '/admin',
    '/admin/users',
    '/admin/signups',
    '/admin/qr',
    '/admin/offers',
    '/admin/reports',
    '/admin/elasticsearch',
    '/admin/cache',
    '/admin/machines',
]);

/**
 * Whether a path, without its locale prefix, is one of the superadmin's pages
 * or below one. The dashboard itself does not count: it sends a realm admin
 * on to their cities, so the proxy can send them there.
 */
export function isSuperadminAdminSubpage(path: string): boolean {
    for (const page of SUPERADMIN_ADMIN_PAGES) {
        if (page !== '/admin' && (path === page || path.startsWith(page + '/'))) return true;
    }
    return false;
}
