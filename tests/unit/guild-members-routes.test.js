const assert = require('assert');
const { Collection } = require('discord.js');
const registerMembersRoutes = require('../../apps/api/src/routes/guilds/members');

const heavyRead = () => {};
const limits = new Map();
const rl = {
  heavyRead: () => heavyRead,
  limit: (name) => {
    if (!limits.has(name)) limits.set(name, () => {});
    return limits.get(name);
  },
  bulkModeration: () => () => {},
  botMessaging: () => () => {},
};
const noPermissionCheck = () => () => {};
const routes = [];
const router = Object.fromEntries(['get', 'post', 'patch', 'delete'].map((method) => [
  method,
  (path, ...handlers) => routes.push({ method: method.toUpperCase(), path, handlers }),
]));
registerMembersRoutes(router, {
  requirePerm: noPermissionCheck,
  rl,
  hierarchyError: async () => null,
  sessionUserId: () => null,
});

function find(method, path) {
  const route = routes.find((item) => item.method === method && item.path === path);
  assert(route, `missing route ${method} ${path}`);
  return route;
}

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

(async () => {
  const membersRoute = find('GET', '/members');
  assert.strictEqual(membersRoute.handlers[0], heavyRead, 'member listing uses the heavy-read cap');

  let fetchOptions;
  const fetchedMember = {
    id: '123456789012345678',
    user: { username: 'fetched', bot: false, displayAvatarURL: () => 'avatar' },
    nickname: null,
    displayName: 'Fetched',
    joinedAt: new Date(0),
    roles: { cache: { size: 1 }, highest: { name: '@everyone' } },
    permissions: { has: () => false },
    communicationDisabledUntil: null,
  };
  const cache = new Collection();
  const guild = {
    memberCount: 10_000,
    members: {
      cache,
      search: undefined,
      async fetch(options) {
        fetchOptions = options;
        return new Collection([[fetchedMember.id, fetchedMember]]);
      },
    },
  };
  let res = response();
  await membersRoute.handlers.at(-1)({ query: {}, guild }, res, (err) => { throw err; });
  assert.deepStrictEqual(fetchOptions, { limit: 100 }, 'fallback member fetch is capped at 100');
  assert.strictEqual(res.body.length, 1);

  let searchOptions;
  guild.members.search = async (options) => {
    searchOptions = options;
    return new Collection([[fetchedMember.id, fetchedMember]]);
  };
  res = response();
  await membersRoute.handlers.at(-1)({ query: { q: 'FETCHED' }, guild }, res, (err) => { throw err; });
  assert.deepStrictEqual(searchOptions, { query: 'fetched', limit: 100 });
  assert.strictEqual(res.body[0].id, fetchedMember.id);

  res = response();
  await membersRoute.handlers.at(-1)({ query: { q: 'x'.repeat(101) }, guild }, res, () => {});
  assert.strictEqual(res.statusCode, 400, 'unbounded search queries are rejected');
  assert.strictEqual(searchOptions.query, 'fetched', 'invalid query must not reach Discord');

  const notesListRoute = find('GET', '/notes');
  assert.strictEqual(notesListRoute.handlers[0], heavyRead, 'guild-wide note scans use the heavy-read cap');
  assert(find('POST', '/members/:userId/notes').handlers.includes(limits.get('member-record-write')),
    'record mutations have a shared per-user rate limit');

  let memberFetches = 0;
  const actionRoute = find('POST', '/members/:userId/action');
  res = response();
  await actionRoute.handlers.at(-1)({
    params: { userId: '123456789012345678' },
    body: { action: 'not-a-moderation-action' },
    guild: { members: { fetch: async () => { memberFetches += 1; } } },
  }, res, () => {});
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(memberFetches, 0, 'invalid moderation actions are rejected before Discord REST calls');

  const rolesRoute = find('POST', '/members/:userId/roles');
  res = response();
  await rolesRoute.handlers.at(-1)({
    params: { userId: '123456789012345678' },
    body: { roles: Array.from({ length: 101 }, () => '223456789012345678') },
    guild: { members: { fetch: async () => { memberFetches += 1; } } },
  }, res, () => {});
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(memberFetches, 0, 'oversized role changes are rejected before Discord REST calls');

  console.log('Guild member route bounds and rate-limit checks passed.');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
