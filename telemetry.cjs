// Sends the server's logs to PostHog Logs over OpenTelemetry: every console
// call, and one record per incoming request.
//
// `production:start` loads this file with `node --require`, before Next. The
// HTTP instrumentation has to patch `http` before Next creates its server, and
// Next creates it before it runs src/instrumentation.ts, so the setup cannot
// live there. Without NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN it loads nothing else.
//
// The records are not masked. The app keeps personal data out of its log lines
// where they start (createPrismaClient, the Elasticsearch retry wrapper, a lint
// rule on console calls, an integration test with canary values). PostHog's
// ingestion scrubbing is on as a net, and an alert on its marker finds a line
// that still leaks: see docs/infrastructure.md, "Logs".

const { logSafePath } = require('./src/lib/utils/logSafePath.cjs');

// The same EU ingest host as POSTHOG_EU_INGEST in src/lib/mcp/analytics.ts; this
// file runs in plain Node, outside the Next bundle, so it cannot import that one.
const POSTHOG_LOGS_URL = 'https://eu.i.posthog.com/i/v1/logs';
const HTTP_SCOPE = '@opentelemetry/instrumentation-http';
const ABORTED = 'opencouncil.aborted';
// PostHog rejects a request over 2 MB whole, before and after gzip, and drops the batch.
// 100 records of 16,000 bytes, with their attributes, stay under it.
const MAX_BODY_BYTES = 16_000;
const MAX_BATCH_RECORDS = 100;
const FLUSH_TIMEOUT_MS = 2_000;

// Child processes inherit NODE_OPTIONS. Only this process sends telemetry.
if (process.env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = process.env.NODE_OPTIONS.replace(/--require\s+\S*telemetry\.cjs/g, '').trim();
}

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

function start(token) {
    const { hostname } = require('node:os');
    const { context, diag, DiagLogLevel, SpanKind, trace } = require('@opentelemetry/api');
    const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
    const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
    const { registerInstrumentations } = require('@opentelemetry/instrumentation');
    const { ConsoleInstrumentation } = require('@opentelemetry/instrumentation-console');
    const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
    const { resourceFromAttributes } = require('@opentelemetry/resources');
    const { BatchLogRecordProcessor, LoggerProvider } = require('@opentelemetry/sdk-logs');
    const { AlwaysOnSampler, NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');

    // Export failures (a wrong token, a 413, PostHog unreachable) go to stderr, not
    // through the patched console. Only errors: Next's own spans raise a warning per
    // request when they are written to after they ended.
    // One short line per failure: while PostHog is unreachable this fires about every 10 s.
    const toStderr = (...args) => process.stderr.write(`[telemetry] ${args.join(' ').replace(/\s+/g, ' ').slice(0, 300)}\n`);
    diag.setLogger({ error: toStderr, warn: toStderr, info: () => {}, debug: () => {}, verbose: () => {} }, DiagLogLevel.ERROR);

    // The same default as src/env.mjs.
    const deploymentEnv = process.env.DEPLOYMENT_ENV
        ?? (process.env.NODE_ENV === 'development' ? 'development' : 'production');
    const url = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT || POSTHOG_LOGS_URL;
    const resource = resourceFromAttributes({
        'service.name': 'opencouncil',
        'deployment.environment.name': deploymentEnv,
        // The container's hostname: tells apart the lines of two instances, or of an
        // instance and its replacement during a deploy.
        'service.instance.id': hostname(),
    });

    const loggerProvider = new LoggerProvider({
        resource,
        processors: [
            { onEmit: truncateBody, forceFlush: async () => {}, shutdown: async () => {} },
            new BatchLogRecordProcessor({
                maxExportBatchSize: MAX_BATCH_RECORDS,
                exporter: new OTLPLogExporter({ url, compression: 'gzip', headers: { Authorization: `Bearer ${token}` } }),
            }),
        ],
    });
    // The console instrumentation emits through the global logger provider,
    // not the one registerInstrumentations passes it.
    logs.setGlobalLoggerProvider(loggerProvider);

    const requests = loggerProvider.getLogger('opencouncil.requests');
    const tracerProvider = new NodeTracerProvider({
        resource,
        // Every request gets a record: a client's trace header must not opt it out.
        sampler: new AlwaysOnSampler(),
        spanProcessors: [{
            onStart: span => announceRequest(span),
            onEnd: span => recordRequest(span),
            forceFlush: async () => {},
            shutdown: async () => {},
        }],
    });
    // No propagator: incoming trace headers are client input and must not pick the trace id.
    tracerProvider.register({ propagator: null });

    registerInstrumentations({
        loggerProvider,
        tracerProvider,
        instrumentations: [
            new ConsoleInstrumentation(),
            new HttpInstrumentation({
                disableOutgoingRequestInstrumentation: true,
                ignoreIncomingRequestHook: request => (request.url ?? '').startsWith('/_next/static/'),
                // Without this hook the address comes from the first X-Forwarded-For entry,
                // which the client controls. App Platform sets this header itself.
                requestHook: (span, request) => {
                    const value = request.headers?.['do-connecting-ip'];
                    const client = Array.isArray(value) ? value[0] : value;
                    if (client) span.setAttribute('client.address', client);
                },
                // A response that closes before it finished: the client went away, or the
                // server never answered. The span still reports the default status, 200.
                applyCustomAttributesOnSpan: (span, request, response) => {
                    if (!response.writableFinished) span.setAttribute(ABORTED, true);
                },
            }),
        ],
    });

    const flush = () => loggerProvider.forceFlush({ timeoutMillis: FLUSH_TIMEOUT_MS }).catch(() => {});
    // Next's SIGTERM handler closes the server, then calls process.exit. Hold that exit
    // until the last records are sent. Before Next registers its handler, exit here.
    process.once('SIGTERM', () => {
        const exit = process.exit.bind(process);
        process.exit = code => { void flush().finally(() => exit(code)); };
        if (process.listenerCount('SIGTERM') === 0) process.exit(143);
    });
    globalThis.__opencouncilTelemetry = { flush };
    process.stdout.write(`[telemetry] sending logs to ${new URL(url).host} as opencouncil (${deploymentEnv})\n`);

    /**
     * A stdout line when a request starts. A request that stalls the server never
     * ends, so only this line names it. The id pairs it with the line at the end.
     */
    function announceRequest(span) {
        if (span.kind !== SpanKind.SERVER || span.instrumentationScope.name !== HTTP_SCOPE) return;
        const method = String(span.attributes['http.request.method'] ?? '');
        const path = logSafePath(String(span.attributes['url.path'] ?? ''));
        process.stdout.write(`[request] ${requestId(span)} start ${method} ${path}\n`);
    }

    /**
     * One record per incoming request, with the client address, to PostHog, and a
     * short line without it to stdout, so a crashed instance's last output still
     * names the requests before the crash.
     */
    function recordRequest(span) {
        if (span.kind !== SpanKind.SERVER || span.instrumentationScope.name !== HTTP_SCOPE) return;
        const method = String(span.attributes['http.request.method'] ?? '');
        const path = logSafePath(String(span.attributes['url.path'] ?? ''));
        // 0 when the response failed with an error before it had a status.
        const status = Number(span.attributes['http.response.status_code'] ?? 0);
        const aborted = span.attributes[ABORTED] === true || status === 0;
        const durationMs = Math.round(span.duration[0] * 1000 + span.duration[1] / 1e6);
        const summary = `${method} ${path} ${aborted ? 'aborted' : status} ${durationMs}ms`;

        process.stdout.write(`[request] ${requestId(span)} ${summary}\n`);
        const attributes = {
            'http.request.method': method,
            'url.path': path,
            'http.response.status_code': aborted ? undefined : status,
            duration_ms: durationMs,
            aborted,
            'client.address': span.attributes['client.address'],
            'user_agent.original': span.attributes['user_agent.original'],
        };
        // Both fields, with the text in the same case as the console records:
        // PostHog filters and groups by the text.
        const severity = status >= 500 ? 'ERROR' : status >= 400 || aborted ? 'WARN' : 'INFO';
        requests.emit({
            severityNumber: SeverityNumber[severity],
            severityText: severity.toLowerCase(),
            body: summary,
            context: trace.setSpanContext(context.active(), span.spanContext()),
            attributes: Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== undefined)),
        });
    }
}

// The first 8 hex digits of the span id: enough to pair the two lines of a request.
function requestId(span) {
    return span.spanContext().spanId.slice(0, 8);
}

function truncateBody(record) {
    if (typeof record.body !== 'string' || Buffer.byteLength(record.body, 'utf8') <= MAX_BODY_BYTES) return;
    const bytes = Buffer.from(record.body, 'utf8');
    // A cut inside a multi-byte character decodes to U+FFFD; drop it.
    const kept = bytes.subarray(0, MAX_BODY_BYTES).toString('utf8').replace(/\uFFFD$/, '');
    record.setBody(`${kept}… [truncated ${bytes.length - MAX_BODY_BYTES} bytes]`);
}
