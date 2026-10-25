// The app stand-in for telemetry.test.ts, started with `node --require telemetry.cjs`
// as `production:start` starts Next. FIXTURE_MODE picks the behaviour.
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const { trace } = require('@opentelemetry/api');

const mode = process.env.FIXTURE_MODE;
if (mode === 'bare') {
    // No SIGTERM handler of its own: the state before Next registers one.
    console.log('boot line');
    setInterval(() => {}, 1000);
    process.stdout.write('READY\n');
} else if (mode === 'boot-exit') {
    // The boot probe after a failed database connection: a fatal line, then exit(1).
    setInterval(() => {}, 1000);
    console.error('fatal boot line');
    setTimeout(() => process.exit(1), 10);
} else if (mode === 'worker') {
    const worker = new Worker('console.log("from a worker")', { eval: true });
    worker.on('exit', () => process.stdout.write('WORKER DONE\n'));
} else {
    const server = http.createServer((request, response) => {
        const path = (request.url ?? '').split('?')[0];
        if (path === '/hang') return; // The client goes away first.
        if (path === '/hang500') { response.statusCode = 500; return; } // A status, then the client goes away.
        // As Next does: it writes the matched route onto the active HTTP span.
        if (path === '/el/athens') trace.getActiveSpan()?.setAttribute('http.route', '/[locale]/[cityId]');
        if (path === '/big') console.log('a' + 'α'.repeat(9000));
        // A quote takes 2 bytes once JSON-escaped, a control character 6.
        if (path === '/escaped') console.log('"\u0001'.repeat(8_000));
        if (path === '/many') for (let i = 0; i < 250; i++) console.log(`line ${i}`);
        if (path === '/child') {
            const childOptions = execFileSync(process.execPath, ['-e', 'process.stdout.write(process.env.NODE_OPTIONS ?? "")']).toString();
            response.end(childOptions);
            return;
        }
        // Only fixed paths: a path with a credential must not reach a console line here.
        if (['/ok', '/missing', '/boom', '/traced', '/last'].includes(path)) console.log(`inside ${path}`);
        const failingHealth = path === '/api/health' && request.url.includes('fail');
        response.statusCode = path === '/missing' ? 404 : path === '/boom' || failingHealth ? 500 : 200;
        response.end('ok');
    });
    // Like Next: close the server on SIGTERM, then exit.
    process.on('SIGTERM', () => {
        server.closeAllConnections();
        server.close(() => process.exit(0));
    });
    server.listen(0, '127.0.0.1', () => process.stdout.write(`LISTENING ${server.address().port}\n`));
}
