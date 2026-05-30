require('@testing-library/jest-dom');

// jsdom does not provide TextEncoder/TextDecoder as globals. Next.js 16's
// `next/cache` transitively loads code (web-streams helpers) that references
// TextEncoder at module-eval time, so any test importing a module that pulls
// in `next/cache` (e.g. src/lib/db/meetings.ts) crashes on import without this.
const { TextEncoder, TextDecoder } = require('util');
if (typeof global.TextEncoder === 'undefined') {
    global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
    global.TextDecoder = TextDecoder;
}