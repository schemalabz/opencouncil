// Preload for scripts that import a `server-only` data module. Next.js
// resolves the `server-only` marker itself; plain Node does not, so a script
// maps it to the same empty module that the Jest config uses.
//
//   npx tsx --require ./scripts/lib/allow-server-only.cjs scripts/<script>.ts
const Module = require('module');
const path = require('path');

const empty = path.join(__dirname, '..', '..', '__mocks__', 'empty.js');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request === 'server-only') return empty;
    return resolve.call(this, request, ...rest);
};
