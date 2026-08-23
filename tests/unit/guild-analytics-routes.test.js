const assert = require('assert');
const registerAnalyticsRoutes = require('../../backend/src/routes/guilds/analytics');

function captureRoutes(analytics) {
    const routes = [];
    const router = {
        get(path, handler) {
            routes.push({ method: 'GET', path, handler });
        },
    };
    registerAnalyticsRoutes(router, analytics);
    return routes;
}

function invoke(route, req) {
    let body;
    let forwarded;
    route.handler(req, { json(value) { body = value; } }, (err) => { forwarded = err; });
    return { body, forwarded };
}

const guild = { id: 'guild-object' };
const calls = [];
const analytics = {
    getChart(guildId) {
        calls.push(['chart', guildId]);
        return [{ hour: 7, label: '07:00', messages: 2, joins: 1, commands: 3 }];
    },
    getCommandUsage(guildId) {
        calls.push(['commands', guildId]);
        return { commands: [{ name: 'ping', count: 4 }], total: 4 };
    },
    getSummary(guildId, receivedGuild) {
        calls.push(['summary', guildId, receivedGuild]);
        return { messages24h: 2, joins24h: 1, commands24h: 3, onlineCount: 5, totalCommands: 8 };
    },
};

const routes = captureRoutes(analytics);
assert.deepStrictEqual(
    routes.map(({ method, path }) => ({ method, path })),
    [
        { method: 'GET', path: '/analytics/chart' },
        { method: 'GET', path: '/analytics/commands' },
        { method: 'GET', path: '/analytics/summary' },
    ],
    'the extraction must preserve every analytics method and path in order',
);

assert.deepStrictEqual(invoke(routes[0], { params: { guildId: '123' }, guild }).body,
    [{ hour: 7, label: '07:00', messages: 2, joins: 1, commands: 3 }]);
assert.deepStrictEqual(invoke(routes[1], { params: { guildId: '123' }, guild }).body,
    { commands: [{ name: 'ping', count: 4 }], total: 4 });
assert.deepStrictEqual(invoke(routes[2], { params: { guildId: '123' }, guild }).body,
    { messages24h: 2, joins24h: 1, commands24h: 3, onlineCount: 5, totalCommands: 8 });
assert.deepStrictEqual(calls, [
    ['chart', '123'],
    ['commands', '123'],
    ['summary', '123', guild],
], 'handlers must pass the same guild inputs to the analytics service');

const fallbackRoutes = captureRoutes(null);
const chartFallback = invoke(fallbackRoutes[0], { params: { guildId: '123' }, guild }).body;
assert.strictEqual(chartFallback.length, 24);
assert.deepStrictEqual(chartFallback[0], {
    hour: 0, label: '00:00', messages: 0, joins: 0, commands: 0,
});
assert.deepStrictEqual(chartFallback[23], {
    hour: 23, label: '23:00', messages: 0, joins: 0, commands: 0,
});
assert.deepStrictEqual(invoke(fallbackRoutes[1], { params: { guildId: '123' }, guild }).body,
    { commands: [], total: 0 });
assert.deepStrictEqual(invoke(fallbackRoutes[2], { params: { guildId: '123' }, guild }).body,
    { messages24h: 0, joins24h: 0, commands24h: 0, onlineCount: 0, totalCommands: 0 });

const expectedError = new Error('analytics failed');
const errorRoutes = captureRoutes({
    getChart() { throw expectedError; },
    getCommandUsage() { throw expectedError; },
    getSummary() { throw expectedError; },
});
for (const route of errorRoutes) {
    const result = invoke(route, { params: { guildId: '123' }, guild });
    assert.strictEqual(result.body, undefined, `${route.path} must not send after a service failure`);
    assert.strictEqual(result.forwarded, expectedError, `${route.path} must forward errors to Express`);
}

console.log('Guild analytics route contract tests passed.');
