const crypto = require('crypto');
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

const MORSE = {
    a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....',
    i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.',
    q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-',
    y: '-.--', z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--',
    '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    ' ': '/'
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

const UNITS = {
    km: { m: 1000, label: 'kilometers' },
    mi: { m: 1609.344, label: 'miles' },
    m: { m: 1, label: 'meters' },
    ft: { m: 0.3048, label: 'feet' },
    cm: { m: 0.01, label: 'centimeters' },
    in: { m: 0.0254, label: 'inches' },
    kg: { kg: 1, label: 'kilograms' },
    lb: { kg: 0.45359237, label: 'pounds' },
    g: { kg: 0.001, label: 'grams' },
    c: { kind: 'temp', label: 'Celsius' },
    f: { kind: 'temp', label: 'Fahrenheit' },
    k: { kind: 'temp', label: 'Kelvin' }
};

function clip(s, n = 1000) {
    s = String(s ?? '');
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function convertTemp(value, from, to) {
    let c = value;
    if (from === 'f') c = (value - 32) * 5 / 9;
    if (from === 'k') c = value - 273.15;
    if (to === 'c') return c;
    if (to === 'f') return c * 9 / 5 + 32;
    return c + 273.15;
}

function parseWhen(raw) {
    if (!raw || /^now$/i.test(raw.trim())) return new Date();
    if (/^\d{10}$/.test(raw)) return new Date(Number(raw) * 1000);
    if (/^\d{13}$/.test(raw)) return new Date(Number(raw));
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tools')
        .setDescription('Encode, weather, wiki, crypto and more')
        .addSubcommand(s => s.setName('encode').setDescription('Base64 encode')
            .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true).setMaxLength(1000)))
        .addSubcommand(s => s.setName('decode').setDescription('Base64 decode')
            .addStringOption(o => o.setName('text').setDescription('Base64').setRequired(true).setMaxLength(1500)))
        .addSubcommand(s => s.setName('hash').setDescription('Hash text')
            .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true).setMaxLength(1000))
            .addStringOption(o => o.setName('algo').setDescription('sha256, sha1, md5')))
        .addSubcommand(s => s.setName('uuid').setDescription('New UUID'))
        .addSubcommand(s => s.setName('timestamp').setDescription('Discord timestamp')
            .addStringOption(o => o.setName('when').setDescription('now, unix or ISO').setRequired(true)))
        .addSubcommand(s => s.setName('password').setDescription('Random password')
            .addIntegerOption(o => o.setName('length').setDescription('8-64').setMinValue(8).setMaxValue(64)))
        .addSubcommand(s => s.setName('morse').setDescription('Text to Morse')
            .addStringOption(o => o.setName('text').setDescription('Text or Morse').setRequired(true).setMaxLength(400))
            .addStringOption(o => o.setName('mode').setDescription('to or from')))
        .addSubcommand(s => s.setName('random').setDescription('Random integer')
            .addIntegerOption(o => o.setName('min').setDescription('Min'))
            .addIntegerOption(o => o.setName('max').setDescription('Max')))
        .addSubcommand(s => s.setName('unit').setDescription('Convert units')
            .addNumberOption(o => o.setName('value').setDescription('Value').setRequired(true))
            .addStringOption(o => o.setName('from').setDescription('km mi m ft kg lb c f k').setRequired(true).setMaxLength(4))
            .addStringOption(o => o.setName('to').setDescription('km mi m ft kg lb c f k').setRequired(true).setMaxLength(4)))
        .addSubcommand(s => s.setName('weather').setDescription('Weather')
            .addStringOption(o => o.setName('city').setDescription('City').setRequired(true).setMaxLength(80)))
        .addSubcommand(s => s.setName('wiki').setDescription('Wikipedia')
            .addStringOption(o => o.setName('query').setDescription('Topic').setRequired(true).setMaxLength(80)))
        .addSubcommand(s => s.setName('github').setDescription('GitHub user/repo')
            .addStringOption(o => o.setName('name').setDescription('user or owner/repo').setRequired(true).setMaxLength(80)))
        .addSubcommand(s => s.setName('npm').setDescription('npm package')
            .addStringOption(o => o.setName('package').setDescription('Name').setRequired(true).setMaxLength(80)))
        .addSubcommand(s => s.setName('crypto').setDescription('Coin price')
            .addStringOption(o => o.setName('coin').setDescription('bitcoin, ethereum…').setRequired(true).setMaxLength(40)))
        .addSubcommand(s => s.setName('currency').setDescription('FX convert')
            .addNumberOption(o => o.setName('amount').setDescription('Amount').setRequired(true))
            .addStringOption(o => o.setName('from').setDescription('USD').setRequired(true).setMaxLength(3))
            .addStringOption(o => o.setName('to').setDescription('EUR').setRequired(true).setMaxLength(3)))
        .addSubcommand(s => s.setName('shorten').setDescription('Short URL')
            .addStringOption(o => o.setName('url').setDescription('URL').setRequired(true).setMaxLength(500)))
        .addSubcommand(s => s.setName('ip').setDescription('IP lookup')
            .addStringOption(o => o.setName('query').setDescription('IP or host').setRequired(true).setMaxLength(80)))
        .addSubcommand(s => s.setName('translate').setDescription('Translate text')
            .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true).setMaxLength(400))
            .addStringOption(o => o.setName('to').setDescription('Target lang e.g. de').setRequired(true).setMaxLength(8)))
        .addSubcommand(s => s.setName('time').setDescription('Time in a zone')
            .addStringOption(o => o.setName('zone').setDescription('Europe/Paris').setRequired(true).setMaxLength(60))),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const reply = (p) => client.helpers.safeReply(interaction, p);
        const str = (n) => interaction.options.getString(n);
        const needNet = ['weather', 'wiki', 'github', 'npm', 'crypto', 'currency', 'shorten', 'ip', 'translate'].includes(sub);
        if (needNet && !interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(() => {});
        }

        if (sub === 'encode') {
            const out = Buffer.from(str('text'), 'utf8').toString('base64');
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔐 Base64 encode').setDescription(`\`\`\`${clip(out, 1800)}\`\`\``)] });
        }
        if (sub === 'decode') {
            try {
                const out = Buffer.from(str('text'), 'base64').toString('utf8');
                if (!out) throw new Error('empty');
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔓 Base64 decode').setDescription(`\`\`\`${clip(out, 1800)}\`\`\``)] });
            } catch {
                return reply({ content: '❌ That is not valid Base64.', flags: [MessageFlags.Ephemeral] });
            }
        }
        if (sub === 'hash') {
            const algo = (str('algo') || 'sha256').toLowerCase();
            if (!['sha256', 'sha1', 'md5'].includes(algo)) {
                return reply({ content: '❌ Use sha256, sha1 or md5.', flags: [MessageFlags.Ephemeral] });
            }
            const digest = crypto.createHash(algo).update(str('text')).digest('hex');
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`#️⃣ ${algo.toUpperCase()}`).setDescription(`\`${digest}\``)] });
        }
        if (sub === 'uuid') {
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🆔 UUID').setDescription(`\`${crypto.randomUUID()}\``)] });
        }
        if (sub === 'timestamp') {
            const d = parseWhen(str('when'));
            if (!d) return reply({ content: '❌ Use `now`, a unix timestamp, or an ISO date.', flags: [MessageFlags.Ephemeral] });
            const sec = Math.floor(d.getTime() / 1000);
            const lines = ['t', 'T', 'd', 'D', 'f', 'F', 'R'].map((f) => `\`${f}\` → <t:${sec}:${f}> (\`<t:${sec}:${f}>\`)`);
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🕒 Discord timestamp')
                .setDescription(lines.join('\n')).setFooter({ text: d.toISOString() })] });
        }
        if (sub === 'password') {
            const len = interaction.options.getInteger('length') || 16;
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
            const bytes = crypto.randomBytes(len);
            let out = '';
            for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔑 Password')
                .setDescription(`\`${out}\``).setFooter({ text: 'Not stored. Rotate if you paste it in public.' })], flags: [MessageFlags.Ephemeral] });
        }
        if (sub === 'binary') {
            const mode = str('mode') || 'to';
            const text = str('text');
            if (mode === 'from') {
                const clean = text.replace(/[^01\s]/g, '').trim();
                if (!clean) return reply({ content: '❌ No binary found.', flags: [MessageFlags.Ephemeral] });
                const out = clean.split(/\s+/).map((b) => String.fromCharCode(parseInt(b, 2))).join('');
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('01 From binary').setDescription(clip(out, 1800))] });
            }
            const out = [...text].map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('01 To binary').setDescription(`\`\`\`${clip(out, 1800)}\`\`\``)] });
        }
        if (sub === 'morse') {
            const mode = str('mode') || 'to';
            const text = str('text');
            if (mode === 'from') {
                const out = text.trim().split(/\s+/).map((t) => MORSE_REV[t] ?? '?').join('');
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('·− Morse decode').setDescription(clip(out, 1800))] });
            }
            const out = [...text.toLowerCase()].map((c) => MORSE[c] ?? '').filter(Boolean).join(' ');
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('·− Morse encode').setDescription(`\`${clip(out, 1800)}\``)] });
        }
        if (sub === 'case') {
            const text = str('text');
            const style = str('style');
            let out = text;
            if (style === 'upper') out = text.toUpperCase();
            else if (style === 'lower') out = text.toLowerCase();
            else if (style === 'title') out = text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
            else if (style === 'camel') {
                out = text.toLowerCase().replace(/[^a-z0-9]+([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
            }
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('Aa Case').setDescription(clip(out, 1900))] });
        }
        if (sub === 'length') {
            const text = str('text');
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('📏 Length')
                .addFields(
                    { name: 'Characters', value: `${text.length}`, inline: true },
                    { name: 'Words', value: `${words}`, inline: true },
                    { name: 'Lines', value: `${text.split('\n').length}`, inline: true }
                )] });
        }
        if (sub === 'random') {
            let min = interaction.options.getInteger('min');
            let max = interaction.options.getInteger('max');
            if (min == null) min = 1;
            if (max == null) max = 100;
            if (min > max) [min, max] = [max, min];
            const n = crypto.randomInt(min, max + 1);
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🎲 Random').setDescription(`**${n}**\n\`${min}–${max}\``)] });
        }
        if (sub === 'lorem') {
            const n = interaction.options.getInteger('sentences') || 3;
            const pool = [
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
                'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
                'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
                'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
                'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit.',
                'Neque porro quisquam est qui dolorem ipsum quia dolor sit amet.',
                'Temporibus autem quibusdam et aut officiis debitis aut rerum.'
            ];
            const out = Array.from({ length: n }, (_, i) => pool[i % pool.length]).join(' ');
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('📄 Lorem').setDescription(out)] });
        }
        if (sub === 'unit') {
            const value = interaction.options.getNumber('value');
            const from = String(str('from') || '').toLowerCase();
            const to = String(str('to') || '').toLowerCase();
            const A = UNITS[from];
            const B = UNITS[to];
            if (!A || !B) {
                return reply({ content: '❌ Units: km mi m ft cm in kg lb g c f k', flags: [MessageFlags.Ephemeral] });
            }
            if (A.kind === 'temp' || B.kind === 'temp') {
                if (A.kind !== 'temp' || B.kind !== 'temp') {
                    return reply({ content: '❌ Convert temperature only to another temperature.', flags: [MessageFlags.Ephemeral] });
                }
                const out = convertTemp(value, from, to);
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('📐 Convert')
                    .setDescription(`**${value} ${A.label}** = **${out.toFixed(2)} ${B.label}**`)] });
            }
            if ((A.m && B.m) || (A.kg && B.kg)) {
                const baseKey = A.m ? 'm' : 'kg';
                if (!B[baseKey]) return reply({ content: '❌ Those units are not in the same family.', flags: [MessageFlags.Ephemeral] });
                const out = value * A[baseKey] / B[baseKey];
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('📐 Convert')
                    .setDescription(`**${value} ${A.label}** = **${Number(out.toPrecision(8))} ${B.label}**`)] });
            }
            return reply({ content: '❌ Those units are not in the same family.', flags: [MessageFlags.Ephemeral] });
        }
        if (sub === 'time') {
            const zone = str('zone').trim();
            try {
                const fmt = new Intl.DateTimeFormat('en-GB', {
                    timeZone: zone, weekday: 'long', year: 'numeric', month: 'short',
                    day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
                });
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`🕒 ${zone}`)
                    .setDescription(`**${fmt.format(new Date())}**`)] });
            } catch {
                return reply({ content: '❌ Unknown zone. Try `Europe/Paris` or `America/New_York`.', flags: [MessageFlags.Ephemeral] });
            }
        }
        if (sub === 'color') {
            const raw = str('hex').trim().replace(/^#/, '');
            if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) {
                return reply({ content: '❌ Use a hex color like `#00fbff`.', flags: [MessageFlags.Ephemeral] });
            }
            const hex = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.toLowerCase();
            const n = parseInt(hex, 16);
            const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
            return reply({ embeds: [new EmbedBuilder().setColor(n).setTitle(`🎨 #${hex}`)
                .addFields({ name: 'RGB', value: `\`${r}, ${g}, ${b}\``, inline: true })] });
        }

        try {
            if (sub === 'weather') {
                const city = str('city');
                const { data } = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
                    timeout: 8000,
                    headers: { 'User-Agent': 'EB-Bot/3.1' }
                });
                const cur = data?.current_condition?.[0];
                const area = data?.nearest_area?.[0];
                if (!cur) throw new Error('no weather');
                const place = [area?.areaName?.[0]?.value, area?.country?.[0]?.value].filter(Boolean).join(', ') || city;
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`🌤️ ${place}`)
                    .setDescription(`**${cur.weatherDesc?.[0]?.value || '—'}**`)
                    .addFields(
                        { name: 'Temp', value: `${cur.temp_C}°C / ${cur.temp_F}°F`, inline: true },
                        { name: 'Feels', value: `${cur.FeelsLikeC}°C`, inline: true },
                        { name: 'Humidity', value: `${cur.humidity}%`, inline: true },
                        { name: 'Wind', value: `${cur.windspeedKmph} km/h`, inline: true }
                    )] });
            }
            if (sub === 'wiki') {
                const q = str('query');
                const { data } = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`, {
                    timeout: 8000,
                    headers: { 'User-Agent': 'EB-Bot/3.1 (discord)' },
                    validateStatus: (s) => s < 500
                });
                if (!data?.extract) return reply({ content: `❌ No Wikipedia page for **${q}**.` });
                const embed = new EmbedBuilder().setColor('#00fbff').setTitle(data.title || q)
                    .setURL(data.content_urls?.desktop?.page || null)
                    .setDescription(clip(data.extract, 1800));
                if (data.thumbnail?.source) embed.setThumbnail(data.thumbnail.source);
                return reply({ embeds: [embed] });
            }
            if (sub === 'github') {
                const name = str('name').replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
                const url = name.includes('/')
                    ? `https://api.github.com/repos/${name}`
                    : `https://api.github.com/users/${name}`;
                const { data } = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'EB-Bot' }, validateStatus: (s) => s < 500 });
                if (data?.message === 'Not Found') return reply({ content: `❌ GitHub **${name}** not found.` });
                if (name.includes('/')) {
                    return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`📦 ${data.full_name}`)
                        .setURL(data.html_url).setDescription(clip(data.description || 'No description.', 800))
                        .addFields(
                            { name: '⭐ Stars', value: `${data.stargazers_count}`, inline: true },
                            { name: '🍴 Forks', value: `${data.forks_count}`, inline: true },
                            { name: 'Language', value: data.language || '—', inline: true }
                        )] });
                }
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`👤 ${data.login}`)
                    .setURL(data.html_url).setThumbnail(data.avatar_url)
                    .setDescription(clip(data.bio || 'No bio.', 400))
                    .addFields(
                        { name: 'Repos', value: `${data.public_repos}`, inline: true },
                        { name: 'Followers', value: `${data.followers}`, inline: true },
                        { name: 'Following', value: `${data.following}`, inline: true }
                    )] });
            }
            if (sub === 'npm') {
                const pkg = str('package');
                const { data } = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
                    timeout: 8000, validateStatus: (s) => s < 500
                });
                if (data?.error || !data?.name) return reply({ content: `❌ npm package **${pkg}** not found.` });
                const latest = data['dist-tags']?.latest;
                const ver = latest && data.versions?.[latest];
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`📦 ${data.name}`)
                    .setURL(`https://www.npmjs.com/package/${data.name}`)
                    .setDescription(clip(data.description || 'No description.', 800))
                    .addFields(
                        { name: 'Latest', value: latest || '—', inline: true },
                        { name: 'License', value: String(ver?.license || data.license || '—'), inline: true }
                    )] });
            }
            if (sub === 'crypto') {
                const coin = str('coin').toLowerCase().trim();
                const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
                    timeout: 8000,
                    params: { ids: coin, vs_currencies: 'usd,eur', include_24hr_change: 'true' }
                });
                const row = data?.[coin];
                if (!row) return reply({ content: `❌ Unknown coin **${coin}**. Try \`bitcoin\` or \`ethereum\`.` });
                const ch = row.usd_24h_change;
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`🪙 ${coin}`)
                    .addFields(
                        { name: 'USD', value: `$${Number(row.usd).toLocaleString()}`, inline: true },
                        { name: 'EUR', value: `€${Number(row.eur).toLocaleString()}`, inline: true },
                        { name: '24h', value: ch == null ? '—' : `${ch.toFixed(2)}%`, inline: true }
                    )] });
            }
            if (sub === 'currency') {
                const amount = interaction.options.getNumber('amount');
                const from = str('from').toUpperCase();
                const to = str('to').toUpperCase();
                const { data } = await axios.get('https://api.frankfurter.app/latest', {
                    timeout: 8000, params: { amount, from, to }
                });
                const rate = data?.rates?.[to];
                if (rate == null) return reply({ content: '❌ Unknown currency pair. Use ISO codes like USD, EUR, GBP.' });
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('💱 Currency')
                    .setDescription(`**${amount} ${from}** = **${rate} ${to}**`)] });
            }
            if (sub === 'shorten') {
                const url = str('url');
                try {

                    new URL(url);
                } catch {
                    return reply({ content: '❌ That is not a valid URL.', flags: [MessageFlags.Ephemeral] });
                }
                const { data } = await axios.get('https://is.gd/create.php', {
                    timeout: 8000, params: { format: 'simple', url }
                });
                if (String(data).startsWith('Error')) throw new Error(data);
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔗 Short URL').setDescription(String(data))] });
            }
            if (sub === 'translate') {
                const text = str('text');
                const to = str('to').toLowerCase();
                const { data } = await axios.get('https://api.mymemory.translated.net/get', {
                    timeout: 8000, params: { q: text, langpair: `en|${to}` }
                });
                const out = data?.responseData?.translatedText;
                if (!out) throw new Error('no translation');
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`🌐 → ${to}`)
                    .addFields({ name: 'In', value: clip(text, 500) }, { name: 'Out', value: clip(out, 500) })] });
            }
            if (sub === 'ip') {
                const q = str('query');
                const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(q)}`, {
                    timeout: 8000, params: { fields: 'status,message,query,country,regionName,city,isp,org,timezone,as' }
                });
                if (data.status !== 'success') return reply({ content: `❌ Lookup failed: ${data.message || 'unknown'}.` });
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`🌐 ${data.query}`)
                    .addFields(
                        { name: 'Location', value: [data.city, data.regionName, data.country].filter(Boolean).join(', ') || '—', inline: true },
                        { name: 'ISP', value: data.isp || '—', inline: true },
                        { name: 'Timezone', value: data.timezone || '—', inline: true },
                        { name: 'ASN', value: data.as || '—', inline: false }
                    )] });
            }
        } catch (err) {
            return reply({ content: `❌ Lookup failed. ${clip(err.message || 'Try again later.', 120)}` });
        }
    }
};
