export type SpacesObject = { bucket: string; key: string };

/**
 * The bucket and key behind a public Spaces URL, in any of the forms the app
 * and the task server write:
 *
 * - `https://{bucket}.{region}.digitaloceanspaces.com/{key}`
 * - `https://{bucket}.{region}.cdn.digitaloceanspaces.com/{key}`
 * - `https://{region}.digitaloceanspaces.com/{bucket}/{key}`
 * - the app's own CDN domain, which fronts the app's bucket
 *
 * The task server writes to its own bucket, which on a preview is not the
 * app's, so the bucket must come from the URL and never from the app's
 * settings alone. Null for a URL that is not a Spaces object.
 */
export function spacesObjectFromUrl(url: string, app: { bucket: string; cdnUrl: string }): SpacesObject | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    if (path === "") return null;

    let cdnHost: string | null = null;
    try {
        cdnHost = new URL(app.cdnUrl).host;
    } catch {
        cdnHost = null;
    }
    if (cdnHost !== null && parsed.host === cdnHost) {
        return { bucket: app.bucket, key: path };
    }

    // {bucket}?.{region}.cdn?.digitaloceanspaces.com
    const labels = parsed.host.split(".");
    if (labels.slice(-2).join(".") !== "digitaloceanspaces.com") return null;
    const front = labels.slice(0, -2);
    if (front[front.length - 1] === "cdn") front.pop();
    front.pop(); // the region
    if (front.length === 1) {
        return { bucket: front[0], key: path };
    }
    if (front.length === 0) {
        const [bucket, ...rest] = path.split("/");
        return rest.length > 0 ? { bucket, key: rest.join("/") } : null;
    }
    return null;
}
