const { monitorEventLoopDelay } = require('perf_hooks');

const startedAt = Date.now();
const totals = { requests: 0, errors: 0, authFailures: 0, forbidden: 0, rateLimited: 0, latencyMs: 0, maxLatencyMs: 0 };
const methods = new Map();
const paths = new Map();
const durations = [];
const MAX_SAMPLES = 1000;
const MAX_PATHS = 200;
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();

function normalizedPath(req) {
    return String(req.path || req.url || '/')
        .split('?')[0]
        .replace(/\b\d{17,20}\b/g, ':snowflake')
        .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ':uuid')
        .slice(0, 180);
}

function observe(method, path, status, durationMs) {
    totals.requests++;
    totals.latencyMs += durationMs;
    totals.maxLatencyMs = Math.max(totals.maxLatencyMs, durationMs);
    if (status >= 500) totals.errors++;
    if (status === 401) totals.authFailures++;
    if (status === 403) totals.forbidden++;
    if (status === 429) totals.rateLimited++;
    methods.set(method, (methods.get(method) || 0) + 1);
    if (paths.has(path) || paths.size < MAX_PATHS) {
        const row = paths.get(path) || { requests: 0, errors: 0, latencyMs: 0, maxLatencyMs: 0 };
        row.requests++;
        row.latencyMs += durationMs;
        row.maxLatencyMs = Math.max(row.maxLatencyMs, durationMs);
        if (status >= 500) row.errors++;
        paths.set(path, row);
    }
    durations.push(durationMs);
    if (durations.length > MAX_SAMPLES) durations.shift();
}

function metricsMiddleware(req, res, next) {
    const started = process.hrtime.bigint();
    res.once('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        observe(req.method, normalizedPath(req), res.statusCode, durationMs);
    });
    next();
}

function percentile(values, percentileValue) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

function metricsSnapshot() {
    const memory = process.memoryUsage();
    const uptimeSec = Math.max(1, (Date.now() - startedAt) / 1000);
    const pathRows = [...paths.entries()].map(([path, row]) => ({
        path,
        requests: row.requests,
        errors: row.errors,
        avgLatencyMs: row.requests ? row.latencyMs / row.requests : 0,
        maxLatencyMs: row.maxLatencyMs,
    })).sort((a, b) => b.requests - a.requests).slice(0, 30);
    return {
        startedAt,
        uptimeSec,
        requests: {
            total: totals.requests,
            perSecond: totals.requests / uptimeSec,
            errors: totals.errors,
            errorRate: totals.requests ? totals.errors / totals.requests : 0,
            authFailures: totals.authFailures,
            forbidden: totals.forbidden,
            rateLimited: totals.rateLimited,
            avgLatencyMs: totals.requests ? totals.latencyMs / totals.requests : 0,
            maxLatencyMs: totals.maxLatencyMs,
            p50LatencyMs: percentile(durations, 50),
            p95LatencyMs: percentile(durations, 95),
            methods: Object.fromEntries(methods),
            paths: pathRows,
        },
        process: {
            pid: process.pid,
            node: process.version,
            rss: memory.rss,
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            external: memory.external,
            eventLoopMeanMs: Number(eventLoop.mean || 0) / 1e6,
            eventLoopMaxMs: Number(eventLoop.max || 0) / 1e6,
            eventLoopP95Ms: Number(eventLoop.percentile(95) || 0) / 1e6,
        },
    };
}

function closeMetrics() { eventLoop.disable(); }
function resetForTests() {
    Object.assign(totals, { requests: 0, errors: 0, authFailures: 0, forbidden: 0, rateLimited: 0, latencyMs: 0, maxLatencyMs: 0 });
    methods.clear(); paths.clear(); durations.length = 0; eventLoop.reset();
}

module.exports = { metricsMiddleware, metricsSnapshot, normalizedPath, observe, closeMetrics, resetForTests };
