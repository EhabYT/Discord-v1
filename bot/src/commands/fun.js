const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

const BALL = [
    'It is certain.', 'Without a doubt.', 'You may rely on it.', 'Yes — definitely.',
    'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Signs point to yes.',
    'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.',
    "Don't count on it.", 'My reply is no.', 'Outlook not so good.', 'Very doubtful.'
];
const JOKES = [
    'Why do programmers prefer dark mode? Because light attracts bugs.',
    'A SQL query walks into a bar, walks up to two tables and asks: “Can I join you?”',
    'Why did the developer go broke? Because he used up all his cache.',
    'There are 10 kinds of people: those who understand binary and those who don’t.',
    'I told my computer I needed a break, and it said “No problem — I’ll go to sleep.”',
    'Why do Java developers wear glasses? Because they don’t C#.',
    'What’s a pirate’s favorite programming language? R.',
    'I would tell you a UDP joke, but you might not get it.',
    'Why was the equal sign so humble? It knew it wasn’t less than or greater than anyone else.',
    'How many programmers does it take to change a light bulb? None — it’s a hardware problem.',
    'I changed my password to “incorrect” so whenever I forget, the computer says “Your password is incorrect.”',
    'Why did the scarecrow win an award? He was outstanding in his field.',
    'I asked the librarian if the library had books on paranoia. She whispered, “They’re right behind you.”',
    'Parallel lines have so much in common. It’s a shame they’ll never meet.',
    'Why can’t you trust atoms? They make up everything.'
];
const FACTS = [
    'Honey never spoils. Edible honey has been found in ancient Egyptian tombs.',
    'Octopuses have three hearts and blue blood.',
    'Bananas are berries, but strawberries are not.',
    'A day on Venus is longer than a year on Venus.',
    'Wombat poop is cube-shaped.',
    'The Eiffel Tower can grow more than 15 cm in summer heat.',
    'Sharks existed before trees.',
    'There are more stars in the universe than grains of sand on Earth.',
    'A group of flamingos is called a flamboyance.',
    'Your brain uses about 20% of your body’s energy.',
    'The shortest war in history lasted 38 minutes (Anglo-Zanzibar War, 1896).',
    'Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.',
    'A bolt of lightning is five times hotter than the surface of the sun.',
    'Koalas have fingerprints almost identical to humans.',
    'The inventor of the Pringles can is buried in one.'
];
const COMPLIMENTS = [
    'You light up every room you join.',
    'Your taste in bots is objectively elite.',
    'You make Discord a better place.',
    'Main-character energy. Certified.',
    'You have the patience of a saint and the humor of a legend.',
    'If kindness was XP, you’d be max level.',
    'You explain things so well even a rubber duck would clap.',
    'Your vibe is premium. No refunds.',
    'You’re the reason group chats stay alive.',
    'Sharp mind, good heart. Rare combo.'
];
const ROASTS = [
    'Your Wi-Fi has more commitment issues than your last three hobbies.',
    'You have the aura of someone who says “per my last email” out loud.',
    'Your opinions load slower than a 2008 YouTube video.',
    'You bring the same energy as a loading spinner that never finishes.',
    'If common sense was a slash command, yours would be disabled.',
    'You peak at “I’ll do it tomorrow.”',
    'Your personality is buffering.',
    'You have main-character confidence and NPC execution.',
    'Even Autocorrect gives up on you.',
    'You treat “5 minutes” like a time zone.'
];
const QUOTES = [
    ['The only way to do great work is to love what you do.', 'Steve Jobs'],
    ['In the middle of difficulty lies opportunity.', 'Albert Einstein'],
    ['We are what we repeatedly do. Excellence, then, is not an act, but a habit.', 'Aristotle'],
    ['It always seems impossible until it’s done.', 'Nelson Mandela'],
    ['Simplicity is the ultimate sophistication.', 'Leonardo da Vinci'],
    ['Do not go where the path may lead, go instead where there is no path and leave a trail.', 'Ralph Waldo Emerson'],
    ['Well-behaved women seldom make history.', 'Laurel Thatcher Ulrich'],
    ['Stay hungry. Stay foolish.', 'Stewart Brand'],
    ['The secret of getting ahead is getting started.', 'Mark Twain'],
    ['What we think, we become.', 'Buddha']
];
const ADVICE = [
    'Drink water. Future you will send a thank-you DM.',
    'If it’s not a hell yes, it’s a no.',
    'Ship the draft. Perfect is a trap.',
    'Mute the noise. Keep the signal.',
    'Sleep is a performance enhancer, not a luxury.',
    'Write it down. Your brain is for ideas, not storage.',
    'One focused hour beats five distracted ones.',
    'Be kind, not nice. Nice avoids. Kind helps.',
    'If you can’t decide, flip a coin — your reaction is the answer.',
    'Leave things better than you found them.'
];
const MOVES = ['rock', 'paper', 'scissors'];
const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function rateScore(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h % 101;
}

function parseHex(raw) {
    const s = String(raw || '').trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(s)) return null;
    const hex = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.toLowerCase();
    const n = parseInt(hex, 16);
    return {
        hex: `#${hex}`,
        r: (n >> 16) & 255,
        g: (n >> 8) & 255,
        b: n & 255,
        int: n
    };
}

async function animalEmbed(title, url, imagePath) {
    const { data } = await axios.get(url, { timeout: 8000 });
    const image = imagePath(data);
    if (!image) throw new Error('no image');
    return new EmbedBuilder().setColor('#00fbff').setTitle(title).setImage(image);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fun')
        .setDescription('Fun commands, animals, memes and text toys')
        .addSubcommand(s => s.setName('8ball').setDescription('Ask the magic 8-ball')
            .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true).setMaxLength(300)))
        .addSubcommand(s => s.setName('choose').setDescription('Pick one option at random')
            .addStringOption(o => o.setName('options').setDescription('Separate with |').setRequired(true)))
        .addSubcommand(s => s.setName('rps').setDescription('Rock-paper-scissors')
            .addStringOption(o => o.setName('move').setDescription('Your move').setRequired(true)
                .addChoices({ name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' })))
        .addSubcommand(s => s.setName('joke').setDescription('Tell a joke'))
        .addSubcommand(s => s.setName('fact').setDescription('Random fun fact'))
        .addSubcommand(s => s.setName('cat').setDescription('Random cat picture'))
        .addSubcommand(s => s.setName('dog').setDescription('Random dog picture'))
        .addSubcommand(s => s.setName('fox').setDescription('Random fox picture'))
        .addSubcommand(s => s.setName('duck').setDescription('Random duck picture'))
        .addSubcommand(s => s.setName('panda').setDescription('Random panda picture'))
        .addSubcommand(s => s.setName('meme').setDescription('Random meme'))
        .addSubcommand(s => s.setName('compliment').setDescription('Get a compliment')
            .addUserOption(o => o.setName('user').setDescription('Who to compliment')))
        .addSubcommand(s => s.setName('roast').setDescription('A playful roast (PG)')
            .addUserOption(o => o.setName('user').setDescription('Who to roast')))
        .addSubcommand(s => s.setName('reverse').setDescription('Reverse some text')
            .addStringOption(o => o.setName('text').setDescription('Text to reverse').setRequired(true).setMaxLength(500)))
        .addSubcommand(s => s.setName('mock').setDescription('sPoNgEbOb-case some text')
            .addStringOption(o => o.setName('text').setDescription('Text to mock').setRequired(true).setMaxLength(500)))
        .addSubcommand(s => s.setName('clap').setDescription('Add 👏 between words')
            .addStringOption(o => o.setName('text').setDescription('Text').setRequired(true).setMaxLength(400)))
        .addSubcommand(s => s.setName('rate').setDescription('Rate something from 0 to 100')
            .addStringOption(o => o.setName('thing').setDescription('What to rate').setRequired(true).setMaxLength(200)))
        .addSubcommand(s => s.setName('quote').setDescription('A short quote'))
        .addSubcommand(s => s.setName('advice').setDescription('A piece of advice'))
        .addSubcommand(s => s.setName('number').setDescription('A random number fact'))
        .addSubcommand(s => s.setName('color').setDescription('Preview a hex color')
            .addStringOption(o => o.setName('hex').setDescription('#00fbff or 00fbff').setRequired(true).setMaxLength(8))),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const reply = (payload) => client.helpers.safeReply(interaction, payload);
        const target = () => interaction.options.getUser('user') || interaction.user;

        if (sub === '8ball') {
            const question = interaction.options.getString('question');
            const answer = pick(BALL);
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🎱 Magic 8-Ball')
                .addFields({ name: 'Question', value: question }, { name: 'Answer', value: `**${answer}**` })
                .setFooter({ text: interaction.user.username, iconURL: interaction.user.displayAvatarURL() }).setTimestamp()] });
        }

        if (sub === 'choose') {
            const choices = interaction.options.getString('options').split('|').map(s => s.trim()).filter(Boolean);
            if (choices.length < 2) return reply({ content: '❌ Give at least two options, separated by `|`.', flags: [MessageFlags.Ephemeral] });
            const chosen = pick(choices);
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🎯 I choose…').setDescription(`**${chosen}**`)
                .setFooter({ text: `Out of ${choices.length} options` }).setTimestamp()] });
        }

        if (sub === 'rps') {
            const you = interaction.options.getString('move');
            const bot = pick(MOVES);
            let result = "It's a tie!";
            let color = '#FFA500';
            if (BEATS[you] === bot) { result = 'You win!'; color = '#00FF00'; }
            else if (BEATS[bot] === you) { result = 'You lose!'; color = '#FF0000'; }
            return reply({ embeds: [new EmbedBuilder().setColor(color).setTitle('✊ Rock · Paper · Scissors')
                .addFields(
                    { name: 'You', value: `${EMOJI[you]} ${you}`, inline: true },
                    { name: 'Bot', value: `${EMOJI[bot]} ${bot}`, inline: true },
                    { name: 'Result', value: `**${result}**` }
                ).setTimestamp()] });
        }

        if (sub === 'joke') {
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('😂 Joke')
                .setDescription(pick(JOKES)).setTimestamp()] });
        }

        if (sub === 'fact') {
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🧠 Fun Fact')
                .setDescription(pick(FACTS)).setTimestamp()] });
        }

        if (sub === 'compliment') {
            const user = target();
            return reply({ embeds: [new EmbedBuilder().setColor('#7CFFB2').setTitle('💖 Compliment')
                .setDescription(`${user} — ${pick(COMPLIMENTS)}`).setTimestamp()] });
        }

        if (sub === 'roast') {
            const user = target();
            return reply({ embeds: [new EmbedBuilder().setColor('#FF6B6B').setTitle('🔥 Roast')
                .setDescription(`${user} — ${pick(ROASTS)}`)
                .setFooter({ text: 'All in good fun' }).setTimestamp()] });
        }

        if (sub === 'reverse') {
            const text = interaction.options.getString('text');
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔁 Reversed')
                .setDescription(text.split('').reverse().join('').slice(0, 2000))] });
        }

        if (sub === 'mock') {
            const text = interaction.options.getString('text');
            const mocked = [...text].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join('');
            return reply({ embeds: [new EmbedBuilder().setColor('#F4D35E').setTitle('🧽 Mock')
                .setDescription(mocked.slice(0, 2000))] });
        }

        if (sub === 'clap') {
            const text = interaction.options.getString('text').trim().split(/\s+/).join(' 👏 ');
            return reply({ content: text.slice(0, 1900) });
        }

        if (sub === 'rate') {
            const thing = interaction.options.getString('thing');
            const score = rateScore(thing.toLowerCase());
            const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('📊 Rate')
                .setDescription(`**${thing}**\n\`${bar}\` **${score}/100**`)] });
        }

        if (sub === 'quote') {
            const [text, author] = pick(QUOTES);
            return reply({ embeds: [new EmbedBuilder().setColor('#C9A7FF').setTitle('💬 Quote')
                .setDescription(`“${text}”\n— **${author}**`)] });
        }

        if (sub === 'advice') {
            return reply({ embeds: [new EmbedBuilder().setColor('#7CFFB2').setTitle('💡 Advice')
                .setDescription(pick(ADVICE))] });
        }

        if (sub === 'number') {
            const n = Math.floor(Math.random() * 200) + 1;
            try {
                if (!interaction.deferred && !interaction.replied) await interaction.deferReply().catch(() => {});
                const { data } = await axios.get(`http://numbersapi.com/${n}/trivia`, { timeout: 6000, responseType: 'text' });
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`🔢 ${n}`)
                    .setDescription(String(data).slice(0, 1000))] });
            } catch {
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(`🔢 ${n}`)
                    .setDescription(`${n} is a perfectly good number. The trivia API is napping.`)] });
            }
        }

        if (sub === 'color') {
            const parsed = parseHex(interaction.options.getString('hex'));
            if (!parsed) return reply({ content: '❌ Use a hex color like `#00fbff` or `ff8800`.', flags: [MessageFlags.Ephemeral] });
            return reply({ embeds: [new EmbedBuilder().setColor(parsed.int).setTitle(`🎨 ${parsed.hex}`)
                .addFields(
                    { name: 'RGB', value: `\`${parsed.r}, ${parsed.g}, ${parsed.b}\``, inline: true },
                    { name: 'HEX', value: `\`${parsed.hex}\``, inline: true }
                )
                .setThumbnail(`https://singlecolorimage.com/get/${parsed.hex.slice(1)}/128x128`)] });
        }

        const animals = {
            cat: () => animalEmbed('🐱 Meow', 'https://api.thecatapi.com/v1/images/search', (d) => d?.[0]?.url),
            dog: () => animalEmbed('🐶 Woof', 'https://dog.ceo/api/breeds/image/random', (d) => d.message),
            fox: () => animalEmbed('🦊 What does the fox say?', 'https://randomfox.ca/floof/', (d) => d.image),
            duck: () => animalEmbed('🦆 Quack', 'https://random-d.uk/api/v2/random', (d) => d.url),
            panda: () => animalEmbed('🐼 Bamboo time', 'https://some-random-api.com/animal/panda', (d) => d.image),
            meme: async () => {
                const { data } = await axios.get('https://meme-api.com/gimme', { timeout: 8000 });
                if (!data?.url) throw new Error('no meme');
                return new EmbedBuilder().setColor('#00fbff').setTitle(data.title || '😂 Meme')
                    .setURL(data.postLink || null).setImage(data.url)
                    .setFooter({ text: data.subreddit ? `r/${data.subreddit}` : 'meme' });
            }
        };

        if (animals[sub]) {
            if (!interaction.deferred && !interaction.replied) await interaction.deferReply().catch(() => {});
            try {
                return reply({ embeds: [await animals[sub]()] });
            } catch {
                return reply({ content: '❌ Could not fetch that right now. Try again in a moment.' });
            }
        }
    }
};
