const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');

function mockUser(id, extras = {}) {
    return {
        id,
        username: extras.username || `User${id}`,
        tag: extras.tag || `User${id}#0001`,
        bot: !!extras.bot,
        createdTimestamp: Date.now() - 86400000 * 400,
        displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
        bannerURL: () => extras.banner || null,
        toString: () => `<@${id}>`,
        ...extras
    };
}

function mockInteraction(extra = {}) {
    const replies = [];
    const user = extra.asUser || mockUser('1', { username: 'Tester', tag: 'Tester#0001' });
    const targetUser = extra.user || mockUser('2', { username: 'Other', tag: 'Other#0002' });
    const role = extra.role || { id: '30', name: 'Member', toString: () => '<@&30>', hexColor: '#00fbff', mentionable: true, hoist: false, members: { size: 1 }, permissions: { toArray: () => ['SendMessages'] } };
    const channel = extra.channel || {
        id: '20',
        name: 'general',
        type: 0,
        nsfw: false,
        topic: null,
        createdTimestamp: Date.now() - 86400000,
        send: async (p) => { replies.push(p); return { id: 'm1', react: async () => {}, createdTimestamp: Date.now() }; },
        messages: {
            fetch: extra.fetchMessages || (async () => {
                const col = { first: () => ({ id: 'fm', url: 'https://discord.com/channels/10/20/fm', author: user, createdTimestamp: Date.now() - 10000, content: 'hi' }) };
                return col;
            }),
            cache: { size: 3 }
        },
        permissionOverwrites: { edit: async () => {}, cache: { get: () => null } },
        setRateLimitPerUser: async () => {},
        bulkDelete: async () => ({ size: 1 }),
        toString: () => '<#20>'
    };
    const member = {
        id: user.id,
        user,
        permissions: { has: () => true },
        roles: {
            cache: {
                has: () => false,
                filter: (fn) => {
                    const arr = [role].filter(fn);
                    arr.map = [].map.bind(arr);
                    arr.size = arr.length;
                    return arr;
                },
                size: 2,
                map: (fn) => [role].map(fn)
            },
            highest: { position: 10, toString: () => '<@&30>', name: 'Member' },
            add: async () => {},
            remove: async () => {},
            set: async () => {}
        },
        voice: { channel: extra.voiceChannel || null, setChannel: async () => {}, setMute: async () => {} },
        manageable: extra.manageable !== false,
        kickable: true,
        bannable: true,
        moderatable: true,
        timeout: async () => {},
        kick: async () => {},
        ban: async () => {},
        setNickname: async () => {},
        displayHexColor: '#00fbff',
        displayName: user.username,
        joinedTimestamp: Date.now() - 86400000 * 10,
        toString: () => `<@${user.id}>`
    };

    const guild = {
        id: '10',
        name: 'Test Guild',
        ownerId: '99',
        description: 'A test guild',
        iconURL: () => extra.guildIcon || null,
        bannerURL: () => extra.guildBanner || null,
        splashURL: () => null,
        memberCount: 5,
        createdTimestamp: Date.now() - 86400000 * 30,
        premiumSubscriptionCount: 0,
        premiumTier: 0,
        verificationLevel: 1,
        vanityURLCode: null,
        maximumMembers: 500000,
        features: [],
        fetchOwner: async () => ({ user: mockUser('99', { tag: 'Owner#0001' }), toString: () => '<@99>' }),
        invites: {
            fetch: async () => {
                const list = new Map([['abcd', { code: 'abcd', uses: 3, inviterId: '1' }]]);
                list.filter = (fn) => {
                    const out = new Map([...list].filter(([, v]) => fn(v)));
                    out.reduce = (cb, init) => [...out.values()].reduce(cb, init);
                    return out;
                };
                return list;
            }
        },
        members: {
            me: { ...member, roles: { ...member.roles, highest: { position: 20 } }, permissions: { has: () => true }, voice: { channel: null } },
            fetch: async (id) => {
                if (id === 'missing') return null;
                if (id && typeof id === 'string') {
                    return { ...member, id, user: mockUser(id), isCommunicationDisabled: () => false };
                }
                const col = new Map([[member.id, member], ['2', { ...member, id: '2', user: mockUser('2') }]]);
                return col;
            },
            cache: {
                filter: () => ({ size: 1, map: () => [] }),
                get: () => member,
                size: 5,
                map: () => [member]
            },
            ban: async () => {},
            unban: async () => {}
        },
        channels: {
            cache: {
                filter: () => {
                    const col = new Map([[channel.id, channel]]);
                    col.size = 1;
                    col.map = (fn) => [...col.values()].map(fn);
                    col.find = (fn) => [...col.values()].find(fn);
                    return col;
                },
                get: () => channel,
                find: () => channel
            },
            create: async ({ name }) => ({ ...channel, name, id: '21', toString: () => '<#21>' }),
            fetch: async () => channel
        },
        roles: {
            cache: {
                get: () => role,
                size: 3,
                filter: (fn) => {
                    const arr = [role].filter(fn);
                    arr.map = [].map.bind(arr);
                    return arr;
                }
            },
            create: async () => role
        },
        emojis: {
            create: async () => ({ name: 'x', imageURL: () => 'https://cdn.discordapp.com/emojis/1.png', toString: () => '<:x:1>' }),
            cache: { size: 0 }
        },
        bans: { fetch: async () => ({ reason: 'test', user: targetUser }) },
        toString: () => 'Test Guild'
    };

    const interaction = {
        user,
        member,
        guild,
        channel,
        createdTimestamp: Date.now() - 20,
        options: {
            getString: (n) => extra.strings?.[n] ?? null,
            getInteger: (n) => extra.ints?.[n] ?? null,
            getNumber: (n) => extra.nums?.[n] ?? null,
            getUser: (n) => {
                if (extra.users && n && extra.users[n]) return extra.users[n];
                return extra.user || null;
            },
            getRole: () => extra.role || role,
            getChannel: () => extra.channel || channel,
            getBoolean: () => extra.bool ?? null,
            getSubcommand: () => extra.sub || null,
            getSubcommandGroup: () => extra.group || null
        },
        reply: async (p) => {
            replies.push(p);
            interaction.replied = true;
            return {
                react: async () => {},
                createdTimestamp: Date.now(),
                createMessageComponentCollector: () => ({
                    on: () => {},
                    once: () => {},
                    stop: () => {}
                })
            };
        },
        editReply: async (p) => { replies.push(p); return p; },
        deferReply: async () => { interaction.deferred = true; },
        fetchReply: async () => ({
            react: async () => {},
            createdTimestamp: Date.now(),
            createMessageComponentCollector: () => ({
                on: () => {},
                once: () => {},
                stop: () => {}
            })
        }),
        followUp: async (p) => { replies.push(p); return p; },
        deferred: false,
        replied: false,
        inGuild: () => true,
        guildId: '10',
        memberPermissions: { has: () => true },
        commandName: extra.name || 'test',
        customId: extra.customId || '',
        values: extra.values || [],
        client: extra.clientRef || null
    };
    return { interaction, replies };
}

const mem = new Map();
const db = {
    get: async (k) => mem.has(k) ? mem.get(k) : null,
    set: async (k, v) => { mem.set(k, v); return v; },
    delete: async (k) => { mem.delete(k); },
    all: async () => [...mem.entries()].map(([id, value]) => ({ id, value }))
};

const helpers = require(path.join(root, 'shared/utils/discord'));

const client = {
    user: mockUser('bot', { username: 'EB', tag: 'EB#0000', bot: true }),
    helpers,
    users: { fetch: async (id) => mockUser(id || '2'), cache: { size: 2 } },
    guilds: { cache: { size: 1 } },
    channels: { fetch: async () => null },
    ws: { ping: 42 },
    uptime: 5000,
    db,
    player: {
        nodes: { get: () => null },
        play: async () => { throw new Error('no voice'); },
        search: async () => ({ tracks: [] }),
        lyrics: { search: async () => [] },
        extractors: { loadMulti: async () => {} }
    }
};

async function run(file, extra = {}) {
    const cmd = require(path.join(root, 'bot', 'src', 'commands', file));
    const { interaction, replies } = mockInteraction({ ...extra, name: cmd.data.name });
    interaction.client = client;
    await cmd.execute(interaction, client, db);
    return replies;
}

function dump(r) {
    return JSON.stringify(r?.[0] || r);
}

(async () => {
    const fails = [];
    async function t(label, fn) {
        try { await fn(); }
        catch (e) { fails.push([label, e.message]); }
    }

    await t('fun-8ball', async () => {
        const r = await run('fun.js', { sub: '8ball', strings: { question: 'Will it work?' } });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('fun-choose', async () => {
        const r = await run('fun.js', { sub: 'choose', strings: { options: 'a | b | c' } });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('fun-choose-one', async () => {
        const r = await run('fun.js', { sub: 'choose', strings: { options: 'onlyone' } });
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('should reject');
    });
    await t('fun-rps', async () => {
        const r = await run('fun.js', { sub: 'rps', strings: { move: 'rock' } });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('fun-joke', async () => { if (!(await run('fun.js', { sub: 'joke' }))[0]?.embeds) throw new Error('no embed'); });
    await t('fun-fact', async () => { if (!(await run('fun.js', { sub: 'fact' }))[0]?.embeds) throw new Error('no embed'); });
    await t('fun-cat', async () => {
        const r = await run('fun.js', { sub: 'cat' });
        if (!r.length) throw new Error('no reply');
    });
    await t('fun-dog', async () => {
        const r = await run('fun.js', { sub: 'dog' });
        if (!r.length) throw new Error('no reply');
    });
    await t('fun-roast', async () => {
        if (!(await run('fun.js', { sub: 'roast' }))[0]?.embeds) throw new Error('no embed');
    });
    await t('fun-rate', async () => {
        const r = await run('fun.js', { sub: 'rate', strings: { thing: 'pizza' } });
        if (!dump(r).includes('/100')) throw new Error('no score');
    });
    await t('fun-color-bad', async () => {
        const r = await run('fun.js', { sub: 'color', strings: { hex: 'nope' } });
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('should reject');
    });
    await t('tools-uuid', async () => {
        if (!(await run('tools.js', { sub: 'uuid' }))[0]?.embeds) throw new Error('no embed');
    });
    await t('tools-hash', async () => {
        const r = await run('tools.js', { sub: 'hash', strings: { text: 'eb', algo: 'md5' } });
        if (!dump(r).includes('md5') && !dump(r).toLowerCase().includes('md5')) {
            if (!dump(r).includes('#')) throw new Error('no hash ' + dump(r));
        }
    });
    await t('tools-encode', async () => {
        const r = await run('tools.js', { sub: 'encode', strings: { text: 'EB' } });
        if (!dump(r).includes('RUI=' ) && !dump(r).includes('RUI') && !Buffer.from('EB').toString('base64')) {
            throw new Error('encode failed ' + dump(r));
        }
        if (!dump(r).includes(Buffer.from('EB').toString('base64'))) throw new Error('expected base64 ' + dump(r));
    });
    await t('tools-unit', async () => {
        const r = await run('tools.js', { sub: 'unit', nums: { value: 1 }, strings: { from: 'km', to: 'mi' } });
        if (!r[0]?.embeds) throw new Error('no embed ' + dump(r));
    });
    await t('games-rps', async () => {
        const r = await run('games.js', { sub: 'rps', strings: { move: 'rock' } });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('games-mines', async () => {
        const r = await run('games.js', { sub: 'minesweeper' });
        if (!dump(r).includes('💣') && !r[0]?.embeds) throw new Error('no grid');
    });
    await t('games-guess', async () => {
        const r = await run('games.js', { sub: 'guess' });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('math', async () => {
        const r = await run('math.js', { strings: { expression: '(2+3)*4' } });
        if (!dump(r).includes('20')) throw new Error('expected 20 got ' + dump(r));
    });
    await t('math-pow', async () => {
        const r = await run('math.js', { strings: { expression: '2^8' } });
        if (!dump(r).includes('256')) throw new Error('expected 256 got ' + dump(r));
    });
    await t('math-bad', async () => {
        const r = await run('math.js', { strings: { expression: 'process.exit(1)' } });
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('unsafe eval');
    });
    await t('afk-set', async () => {
        const r = await run('afk.js', { strings: { reason: 'testing' } });
        if (!r[0]?.embeds) throw new Error('no embed');
        const stored = await db.get('afk_10_1');
        if (!stored || stored.reason !== 'testing') throw new Error('not stored');
    });
    await t('pay-self', async () => {
        const r = await run('pay.js', { ints: { amount: 10 }, user: client.user });
        if (!r.length) throw new Error('no reply');
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('should reject bot/self');
    });
    await t('pay-ok', async () => {
        await db.set('points_10_1', 100);
        const r = await run('pay.js', { ints: { amount: 25 }, user: mockUser('3') });
        if (!r[0]?.embeds) throw new Error('no embed ' + dump(r));
        if ((await db.get('points_10_1')) !== 75) throw new Error('balance not deducted');
        if ((await db.get('points_10_3')) !== 25) throw new Error('not credited');
    });
    await t('work', async () => {
        mem.delete('work_cd_10_1');
        const r = await run('work.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('work-cd', async () => {
        const r = await run('work.js');
        if (!String(r[0]?.content || '').includes('⏳')) throw new Error('expected cooldown');
    });
    await t('slots-broke', async () => {
        await db.set('points_10_1', 0);
        const r = await run('slots.js', { ints: { bet: 50 } });
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('should be broke');
    });
    await t('slots-spin', async () => {
        await db.set('points_10_1', 200);
        const r = await run('slots.js', { ints: { bet: 50 } });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('snipe-empty', async () => {
        const r = await run('snipe.js');
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('expected empty snipe');
    });
    await t('tag-list', async () => {
        const r = await run('tag.js', { sub: 'list' });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('tag-set-get', async () => {
        await run('tag.js', { sub: 'set', strings: { name: 'rules', content: 'Be nice' } });
        const r = await run('tag.js', { sub: 'get', strings: { name: 'rules' } });
        if (!String(r[0]?.content || '').includes('Be nice')) throw new Error('tag get failed');
    });
    await t('reminders-empty', async () => {
        const r = await run('reminders.js', { sub: 'list' });
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('expected empty');
    });
    await t('remind-set', async () => {
        const r = await run('remind.js', { strings: { time: '10m', reason: 'check tests' } });
        if (!r[0]?.embeds) throw new Error('no embed ' + dump(r));
        const list = await db.get('reminders_1');
        if (!list?.length) throw new Error('reminder not stored');
    });
    await t('remind-bad', async () => {
        const r = await run('remind.js', { strings: { time: 'soon', reason: 'x' } });
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('should reject');
    });
    await t('daily', async () => {
        const r = await run('daily.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('roll', async () => {
        const r = await run('roll.js', { ints: { sides: 20 } });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('coinflip', async () => {
        const r = await run('coinflip.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('credits', async () => {
        const r = await run('credits.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('points-view', async () => {
        const r = await run('points.js', { user: mockUser('2', { tag: 'Other#0002' }) });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('jumbo-bad', async () => {
        const r = await run('jumbo.js', { strings: { emoji: 'hello' } });
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('should reject');
    });
    await t('channelinfo', async () => {
        const r = await run('channelinfo.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('wyr', async () => {
        const r = await run('wouldyourather.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('wyr-partial', async () => {
        const r = await run('wouldyourather.js', { strings: { option_a: 'only A' } });
        if (!String(r[0]?.content || '').includes('both')) throw new Error('should require both');
    });
    await t('poll', async () => {
        const r = await run('poll.js', { strings: { question: 'Pizza?', options: 'yes | no' } });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('birthday-set', async () => {
        const r = await run('birthday.js', { sub: 'set', ints: { month: 6, day: 15 } });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('birthday-bad-day', async () => {
        const r = await run('birthday.js', { sub: 'set', ints: { month: 2, day: 31 } });
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('should reject feb 31');
    });
    await t('info', async () => {
        const r = await run('info.js');
        if (!r[0]?.embeds) throw new Error('no embed');
        if (!dump(r).includes('3.1.0')) throw new Error('version missing');
    });
    await t('userinfo', async () => {
        const r = await run('userinfo.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('banner-no-asset', async () => {
        const r = await run('banner.js');
        if (!String(r[0]?.content || '').includes('❌')) throw new Error('expected no banner/icon');
    });
    await t('banner-icon-fallback', async () => {
        const r = await run('banner.js', { guildIcon: 'https://cdn.discordapp.com/embed/avatars/1.png' });
        if (!r[0]?.embeds) throw new Error('no embed for icon fallback');
    });
    await t('ship', async () => {
        const r = await run('ship.js', {
            users: { first: mockUser('1'), second: mockUser('2') },
            user: mockUser('2')
        });
        // ship uses getUser('first') / getUser('second')
        if (!r.length) throw new Error('no reply');
    });
    await t('help', async () => {
        const r = await run('help.js');
        if (!r[0]?.embeds) throw new Error('no embed');
        if (dump(r).includes('servericon')) throw new Error('stale servericon in help');
    });
    await t('help-select', async () => {
        const { handleHelpSelect } = require(path.join(root, 'shared/utils/help-interactions'));
        const { interaction, replies } = mockInteraction({ values: ['fun'] });
        interaction.update = async (p) => { replies.push(p); };
        interaction.client = client;
        await handleHelpSelect(interaction);
        if (!replies[0]?.embeds) throw new Error('no embed');
        if (dump(replies).includes('servericon')) throw new Error('stale servericon in select');
    });
    await t('ping', async () => {
        const r = await run('ping.js');
        if (!r.some(x => x?.embeds || String(x?.content || '').includes('Ping'))) throw new Error('no ping reply');
    });
    await t('qr', async () => {
        const r = await run('qr.js', { strings: { text: 'https://example.com' } });
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('stats-missing-fields', async () => {
        await db.set('stats_10_1', { messages: 4 });
        const r = await run('stats.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('avatar', async () => {
        const r = await run('avatar.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('serverinfo', async () => {
        const r = await run('serverinfo.js');
        if (!r[0]?.embeds) throw new Error('no embed');
    });
    await t('membercount', async () => {
        const r = await run('membercount.js');
        if (!r.length) throw new Error('no reply');
    });
    await t('truthordare', async () => {
        const r = await run('truthordare.js', { strings: { type: 'truth' } });
        if (!r.length) throw new Error('no reply');
    });
    await t('streak', async () => {
        const r = await run('streak.js');
        if (!r.length) throw new Error('no reply');
    });
    await t('badges', async () => {
        const r = await run('badges.js');
        if (!r.length) throw new Error('no reply');
    });
    await t('levelsettings-view', async () => {
        const r = await run('levelsettings.js', { sub: 'view' });
        if (!r[0]?.embeds) throw new Error('no embed ' + dump(r));
    });
    await t('birthday-view', async () => {
        const r = await run('birthday.js', { sub: 'view' });
        if (!r.length) throw new Error('no reply');
    });
    await t('warnings-remove', async () => {
        await db.set('warnings_10_2', [{ id: 'abc123', reason: 'spam', moderator: '1', timestamp: Date.now() }]);
        const r = await run('warnings.js', { sub: 'remove', user: mockUser('2'), strings: { id: 'abc123' } });
        if (!r[0]?.embeds) throw new Error('no embed ' + dump(r));
        const left = await db.get('warnings_10_2');
        if (left?.length) throw new Error('warning not deleted');
    });
    await t('warnings-clear', async () => {
        await db.set('warnings_10_2', [
            { id: 'a', reason: 'one', moderator: '1', timestamp: Date.now() },
            { id: 'b', reason: 'two', moderator: '1', timestamp: Date.now() },
        ]);
        const r = await run('warnings.js', { sub: 'clear', user: mockUser('2') });
        if (!r[0]?.embeds) throw new Error('no embed ' + dump(r));
        const left = await db.get('warnings_10_2');
        if (left?.length) throw new Error('warnings not cleared');
    });
    await t('removewarn-one', async () => {
        await db.set('warnings_10_2', [{ id: 'delme', reason: 'old', moderator: '1', timestamp: Date.now() }]);
        const r = await run('removewarn.js', { user: mockUser('2'), strings: { id: 'delme' } });
        if (!r[0]?.embeds) throw new Error('no embed ' + dump(r));
        const left = await db.get('warnings_10_2');
        if (left?.length) throw new Error('warning not removed');
    });

    // Sweep: every command file should at least load + execute without throwing
    const sweep = { ok: 0, crash: [] };
    const files = fs.readdirSync(path.join(root, 'bot', 'src', 'commands')).filter(f => f.endsWith('.js'));
    const defaults = {
        fun: { sub: 'joke' },
        tools: { sub: 'uuid' },
        games: { sub: 'riddle' },
        tag: { sub: 'list' },
        birthday: { sub: 'view' },
        birthdaysettings: { sub: 'view' },
        reminders: { sub: 'list' },
        note: { sub: 'list', user: mockUser('2') },
        suggest: { sub: 'list' },
        giveaway: { sub: 'list' },
        reactionrole: { sub: 'list' },
        ticket: { sub: 'list' },
        welcome: { sub: 'test' },
        logging: { sub: 'status' },
        levelsettings: { sub: 'view' },
        role: { sub: 'add', user: mockUser('2') },
        math: { strings: { expression: '1+1' } },
        pay: { ints: { amount: 1 }, user: mockUser('2') },
        slots: { ints: { bet: 10 } },
        roll: { ints: { sides: 6 } },
        remind: { strings: { time: '1h', reason: 'x' } },
        poll: { strings: { question: 'Q?', options: 'a | b' } },
        qr: { strings: { text: 'hi' } },
        jumbo: { strings: { emoji: 'not-an-emoji' } },
        define: { strings: { word: 'test' } },
        afk: { strings: { reason: 'brb' } },
        ship: { users: { first: mockUser('1'), second: mockUser('2') } },
        points: { user: mockUser('2') },
        announce: { strings: { message: 'hello' } },
        say: { strings: { text: 'hello' } },
        automod: { strings: { feature: 'antiSpam', action: 'toggle' } },
        whitelist: { strings: { type: 'user', action: 'add', target: '1' } },
        lockdown: { strings: { action: 'off' } },
        loop: { ints: { mode: 0 } },
        volume: { ints: { amount: 50 } },
        remove: { ints: { position: 1 } },
        seek: { strings: { time: '30' } },
        filters: { strings: { filter: 'bassboost' } },
        play: { strings: { query: 'never gonna give you up' } },
        lyrics: { strings: { query: 'never gonna give you up' } },
        clear: { ints: { amount: 2 } },
        slowmode: { ints: { seconds: 0 } },
        givexp: { ints: { amount: 10 }, user: mockUser('2') },
        setlevel: { ints: { level: 2 }, user: mockUser('2') },
        resetxp: { user: mockUser('2') },
        warn: { user: mockUser('2'), strings: { reason: 'test' } },
        warnings: { sub: 'list', user: mockUser('2') },
        kick: { user: mockUser('2'), strings: { reason: 'test' } },
        ban: { user: mockUser('2'), strings: { reason: 'test', time: '1h' } },
        softban: { user: mockUser('2'), strings: { reason: 'test' } },
        timeout: { user: mockUser('2'), strings: { time: '10m', reason: 'test' } },
        untimeout: { user: mockUser('2') },
        unban: { strings: { id: '2', reason: 'test' } },
        vmute: { user: mockUser('2'), strings: { reason: 'test' } },
        unvmute: { user: mockUser('2') },
        setnick: { user: mockUser('2'), strings: { nick: 'n' } },
        move: { user: mockUser('2') },
        steal: { strings: { emoji: '<:x:1>', name: 'x' } },
        setupverification: {},
        credits: { user: mockUser('2'), ints: { amount: 5 } },
        removewarn: { user: mockUser('2') },
        leaderboard: { strings: { type: 'xp' } },
        confess: { strings: { message: 'secret' } },
        rep: { user: mockUser('2') }
    };

    for (const file of files) {
        const name = file.replace(/\.js$/, '');
        try {
            await run(file, defaults[name] || {});
            sweep.ok++;
        } catch (e) {
            sweep.crash.push([name, e.message.split('\n')[0]]);
        }
    }

    console.log(JSON.stringify({
        fails,
        targetedOk: fails.length === 0,
        sweep
    }, null, 2));
    process.exit(fails.length ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
