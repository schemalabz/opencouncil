require('@testing-library/jest-dom');

// jsdom (used by the .test.tsx component project) doesn't expose
// TextEncoder/TextDecoder, which some libraries reference. Node provides them
// natively, so this is a no-op in the node project. Heavier Web globals
// (Request/Response/ReadableStream/…) aren't polyfilled here: server-side
// tests run under the node environment where they exist natively, and the
// component tests don't pull in `next/cache`.
const { TextEncoder, TextDecoder } = require('util');
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;
