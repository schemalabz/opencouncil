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

// jsdom doesn't implement matchMedia, which vaul (the mobile drawer) queries on
// mount. A stub that matches nothing is enough: the components under test fall
// back to their default branch, and the tests drive the behaviour they care
// about themselves.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => { },
        removeListener: () => { },
        addEventListener: () => { },
        removeEventListener: () => { },
        dispatchEvent: () => false,
    });
}
