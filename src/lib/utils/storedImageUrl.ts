import { IMAGE_STORAGE_HOSTS } from '@/lib/utils/storageHosts.cjs';

/** https with no credentials and no port: the only form of URL that the server fetches an image from. */
export function isPlainHttpsUrl(url: URL): boolean {
    return url.protocol === 'https:' && !url.username && !url.password && !url.port;
}

/** Whether the site draws this URL as it is: a plain https URL on our storage. */
export function isStoredImageUrl(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl);
        return isPlainHttpsUrl(url) && IMAGE_STORAGE_HOSTS.includes(url.hostname);
    } catch {
        return false;
    }
}
