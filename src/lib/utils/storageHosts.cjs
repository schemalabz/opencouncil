// Plain CommonJS: next.config.mjs imports it, and so does the app.

/**
 * The hosts that serve the images we store. next/image loads only these
 * (next.config.mjs), the OG renderer fetches only these (og/remoteImage.ts),
 * and an image from any other host is copied into storage before its URL is
 * saved (storedImages.ts). data.opencouncil.gr is the CDN in front of the
 * bucket, which serves the subject illustrations.
 */
const IMAGE_STORAGE_HOSTS = ['townhalls-gr.fra1.digitaloceanspaces.com', 'data.opencouncil.gr', 'fra1.digitaloceanspaces.com'];

module.exports = { IMAGE_STORAGE_HOSTS };
