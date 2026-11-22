// Sends the server's logs to PostHog Logs over OpenTelemetry: every console
// call, and one record per incoming request. docs/infrastructure.md, "Logs",
// describes the records, the safeguards and the PostHog settings.
//
// `production:start` loads this file with `node --require`, before Next. The
// HTTP instrumentation has to patch `http` before Next creates its server, and
// Next creates it before it runs src/instrumentation.ts, so the setup cannot
// live there. Without NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN it loads nothing else.

const { isMainThread } = require('node:worker_threads');

const PATH = 'opencouncil.path';
// Probed every few seconds: a record only when the check fails.
const HEALTH_PATH = '/api/health';
const ABORTED = 'opencouncil.aborted';
// PostHog rejects a request over 2 MB, before and after gzip, and drops the whole batch.
// The limits below bound one record to about 35 KB as JSON, so a batch of 50 stays
// under it: a body of at most MAX_BODY_BYTES once JSON-escaped, and attribute
// values of at most MAX_ATTRIBUTE_CHARS characters (a path and a user agent come
// from the client).
const MAX_BODY_BYTES = 16_000;
const MAX_ATTRIBUTE_CHARS = 1_024;
const MAX_BATCH_RECORDS = 50;
const FLUSH_TIMEOUT_MS = 2_000;

// `--require` also reaches worker threads. Only the main thread sends telemetry.
if (isMainThread) {
    // The browser's project token. This file is not bundled, so Next does not inline
    // the value at build time: the variable must be set at run time too.
    const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    if (token) {
        // Telemetry must never stop the app from starting.
        try {
            start(token);
        } catch (error) {
            process.stderr.write(`[telemetry] off: ${error?.stack ?? error}\n`);
        }
    } else {
        process.stdout.write('[telemetry] off: NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is not set at run time\n');
    }
}

function start(token) {
    const { hostname } = require('node:os');
    const { context, diag, DiagLogLevel, trace } = require('@opentelemetry/api');
    const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
    const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
    const { registerInstrumentations } = require('@opentelemetry/instrumentation');
    const { ConsoleInstrumentation } = require('@opentelemetry/instrumentation-console');
    const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
    const { resourceFromAttributes } = require('@opentelemetry/resources');
    const { BatchLogRecordProcessor, LoggerProvider } = require('@opentelemetry/sdk-logs');
    const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
    const { logSafePath } = require('./src/lib/utils/logSafePath.cjs');
    const { POSTHOG_EU_INGEST } = require('./src/lib/utils/posthogHosts.cjs');
    const { defaultDeploymentEnv } = require('./src/lib/utils/deploymentEnv.cjs');
    const { connectingAddress } = require('./src/lib/utils/clientAddress.cjs');

    // Export failures (a wrong token, a 413, PostHog unreachable) go to stderr, not
    // through the patched console. Only errors: Next's own spans raise a warning per
    // request when they are written to after they ended.
    // One short line per failure: while PostHog is unreachable this fires about every 10 s.
    const toStderr = (...args) => process.stderr.write(`[telemetry] ${args.join(' ').replace(/\s+/g, ' ').slice(0, 300)}\n`);
    diag.setLogger({ error: toStderr }, DiagLogLevel.ERROR);

    // The HTTP instrumentation puts 7 frames of its own under each request handler.
    // With Node's default of 10, a synchronous error would lose the frames that matter.
    if (Error.stackTraceLimit < 20) Error.stackTraceLimit = 20;

    const deploymentEnv = process.env.DEPLOYMENT_ENV ?? defaultDeploymentEnv(process.env.NODE_ENV);
    const url = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || `${POSTHOG_EU_INGEST}/i/v1/logs`;

    const loggerProvider = new LoggerProvider({
        resource: resourceFromAttributes({
            'service.name': 'opencouncil',
            'deployment.environment.name': deploymentEnv,
            // The container's hostname: tells apart the lines of two instances, or of an
            // instance and its replacement during a deploy.
            'service.instance.id': hostname(),
            // The commit of the build, as /api/health reports it: lets PostHog compare
            // the logs before and after a deploy.
            ...(process.env.NEXT_PUBLIC_BUILD_COMMIT_SHA && { 'service.version': process.env.NEXT_PUBLIC_BUILD_COMMIT_SHA }),
        }),
        logRecordLimits: { attributeValueLengthLimit: MAX_ATTRIBUTE_CHARS },
        processors: [
            { onEmit: truncateBody, forceFlush: async () => {}, shutdown: async () => {} },
            new BatchLogRecordProcessor({
                maxExportBatchSize: MAX_BATCH_RECORDS,
                exporter: new OTLPLogExporter({ url, compression: 'gzip', headers: { Authorization: `Bearer ${token}` } }),
            }),
        ],
    });
    // The console instrumentation emits through the global logger provider.
    logs.setGlobalLoggerProvider(loggerProvider);

    const requests = loggerProvider.getLogger('opencouncil.requests');
    const tracerProvider = new NodeTracerProvider({
        spanProcessors: [{
            onStart: () => {},
            onEnd: span => recordRequest(span),
            forceFlush: async () => {},
            shutdown: async () => {},
        }],
    });
    // No propagator: incoming trace headers are client input and must not pick the
    // trace id, or keep a request out of the log by marking it unsampled.
    tracerProvider.register({ propagator: null });

    registerInstrumentations({
        tracerProvider,
        instrumentations: [
            new ConsoleInstrumentation(),
            new HttpInstrumentation({
                disableOutgoingRequestInstrumentation: true,
                ignoreIncomingRequestHook: request => (request.url ?? '').startsWith('/_next/static/'),
                requestHook: (span, request) => {
                    // The path from the raw request line: the instrumentation's `url.path`
                    // reads `//api/join/<token>` as a host and a path, and the
                    // redaction would miss it.
                    const path = logSafePath(request.url ?? '').slice(0, MAX_ATTRIBUTE_CHARS);
                    span.setAttribute(PATH, path);
                    // App Platform sets `do-connecting-ip` itself. Without it, the socket's
                    // peer, never the first X-Forwarded-For entry, which the client controls.
                    const client = connectingAddress(name => request.headers?.[name]) ?? request.socket?.remoteAddress;
                    if (client) span.setAttribute('client.address', client);
                    // A request that stalls the server never ends, so only this line names it.
                    process.stdout.write(`[request] ${span.spanContext().spanId} start ${request.method} ${path}\n`);
                },
                // A response that closes before it finished: the client went away, or the
                // server never answered. The span still reports the default status, 200.
                applyCustomAttributesOnSpan: (span, request, response) => {
                    if (!response.writableFinished) span.setAttribute(ABORTED, true);
                },
            }),
        ],
    });

    // Hold every exit until the last records are sent, or FLUSH_TIMEOUT_MS passes:
    // Next's SIGTERM handler, which drains the server and then calls process.exit,
    // and the boot probe's exit after a failed database connection.
    const exit = process.exit.bind(process);
    let exiting = false;
    process.exit = code => {
        if (exiting) return;
        exiting = true;
        void loggerProvider.forceFlush({ timeoutMillis: FLUSH_TIMEOUT_MS }).catch(() => {}).finally(() => exit(code));
    };
    process.stdout.write(`[telemetry] sending logs to ${new URL(url).host} as opencouncil (${deploymentEnv})\n`);

    /**
     * One record per incoming request, with the client address, to PostHog, and a
     * line without it to stdout. The line and the record carry the span id, which
     * PostHog can filter on.
     */
    function recordRequest(span) {
        const path = span.attributes[PATH];
        // Only the HTTP server spans that requestHook marked; Next's own spans end here too.
        if (typeof path !== 'string') return;
        const method = String(span.attributes['http.request.method'] ?? '');
        // 0 when the response failed with an error before it had a status.
        const status = Number(span.attributes['http.response.status_code'] ?? 0);
        const aborted = span.attributes[ABORTED] === true || status === 0;
        const durationMs = Math.round(span.duration[0] * 1000 + span.duration[1] / 1e6);
        const summary = `${method} ${path} ${aborted ? 'aborted' : status} ${durationMs}ms`;

        process.stdout.write(`[request] ${span.spanContext().spanId} ${summary}\n`);
        if (path === HEALTH_PATH && !aborted && status < 500) return;
        const attributes = {
            'http.request.method': method,
            'url.path': path,
            // The route template, for example /[locale]/[cityId]/[meetingId]: Next's own
            // tracing, which our global tracer turns on, writes it onto this span.
            'http.route': span.attributes['http.route'],
            'http.response.status_code': aborted ? undefined : status,
            duration_ms: durationMs,
            aborted,
            'client.address': span.attributes['client.address'],
            'user_agent.original': span.attributes['user_agent.original'],
        };
        // Both fields, with the text in the same case as the console records:
        // PostHog filters and groups by the text.
        const severity = aborted || (status >= 400 && status < 500) ? 'WARN' : status >= 500 ? 'ERROR' : 'INFO';
        requests.emit({
            severityNumber: SeverityNumber[severity],
            severityText: severity.toLowerCase(),
            body: summary,
            context: trace.setSpanContext(context.active(), span.spanContext()),
            attributes: Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined)),
        });
    }
}

/**
 * Cuts a body to MAX_BODY_BYTES once JSON-escaped, the form the exporter sends:
 * a quote or a control character takes 2 to 6 bytes there.
 */
function truncateBody(record) {
    const body = record.body;
    // Every character takes at most 6 bytes once escaped.
    if (typeof body !== 'string' || body.length * 6 <= MAX_BODY_BYTES) return;
    const escapedBytes = text => Buffer.byteLength(JSON.stringify(text), 'utf8') - 2;
    if (escapedBytes(body) <= MAX_BODY_BYTES) return;
    // Room for the marker, so the result stays within the limit.
    const budget = MAX_BODY_BYTES - 40;
    let keep = 0;
    let high = Math.min(body.length, budget);
    while (keep < high) {
        const mid = Math.ceil((keep + high) / 2);
        if (escapedBytes(body.slice(0, mid)) <= budget) keep = mid;
        else high = mid - 1;
    }
    // Do not end on the first half of a surrogate pair.
    const code = body.charCodeAt(keep - 1);
    if (code >= 0xd800 && code <= 0xdbff) keep -= 1;
    record.setBody(`${body.slice(0, keep)}… [truncated ${body.length - keep} characters]`);
}
