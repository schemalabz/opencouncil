/**
 * A random UUID (version 4), in the browser and on the server.
 * crypto.randomUUID() needs a secure context, so a page served over plain
 * HTTP on the LAN (the dev server's mobile preview) falls back to
 * Math.random.
 */
export function randomUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}
