require('@testing-library/jest-dom');

// The jsdom test environment strips a number of Web Platform globals that
// Node provides. Next.js 16's `next/cache` transitively evaluates web-streams
// and fetch-adapter code at module-load time, so any test importing a module
// that pulls in `next/cache` (e.g. src/lib/db/meetings.ts) crashes on import
// unless we re-supply them.

// Order matters: undici's module-eval references the TextEncoder/TextDecoder
// and ReadableStream globals, so those must be defined BEFORE we require it.

// TextEncoder/TextDecoder — from node:util.
const { TextEncoder, TextDecoder } = require('util');
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

// Web streams — from node:stream/web.
const { ReadableStream, WritableStream, TransformStream } = require('stream/web');
if (typeof global.ReadableStream === 'undefined') global.ReadableStream = ReadableStream;
if (typeof global.WritableStream === 'undefined') global.WritableStream = WritableStream;
if (typeof global.TransformStream === 'undefined') global.TransformStream = TransformStream;

// Fetch API (Request/Response/Headers/fetch) — from undici (Next's own dep).
const { Request, Response, Headers, fetch, FormData } = require('undici');
if (typeof global.Request === 'undefined') global.Request = Request;
if (typeof global.Response === 'undefined') global.Response = Response;
if (typeof global.Headers === 'undefined') global.Headers = Headers;
if (typeof global.fetch === 'undefined') global.fetch = fetch;
if (typeof global.FormData === 'undefined') global.FormData = FormData;