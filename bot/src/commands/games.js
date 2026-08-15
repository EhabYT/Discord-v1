const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const axios = require('axios');
const {
    GAMES, put, get, uid, triviaRows, tttRows, bjEmbed, bjButtons, drawCard, bjValue
} = require('../../../shared/utils/game-interactions');

const RIDDLES = [
    ['I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', 'echo'],
    ['The more you take, the more you leave behind. What am I?', 'footsteps'],
    ['What has keys but can’t open locks?', 'piano'],
    ['What can travel around the world while staying in a corner?', 'stamp'],
    ['What has a head and a tail but no body?', 'coin'],
    ['I’m tall when I’m young and short when I’m old. What am I?', 'candle'],
    ['What gets wetter the more it dries?', 'towel'],
    ['What has many teeth but cannot bite?', 'comb'],
    ['What goes up but never comes down?', 'age'],
    ['What has hands but cannot clap?', 'clock']
];
const WORDS = [
    'nebula', 'cipher', 'velvet', 'quartz', 'phoenix', 'lantern', 'orbit', 'mirage',
    'canyon', 'harbor', 'pixel', 'glacier', 'ember', 'nova', 'willow', 'cobalt',
    'saffron', 'thunder', 'prism', 'aurora'
];
const WORDLE = ['crane', 'slate', 'point', 'flame', 'ghost', 'brave', 'light', 'storm', 'candy', 'music', 'plant', 'queen', 'robot', 'shine', 'trace'];
const EMOJI_QUIZ = [
    ['🦁👑', 'The Lion King'],
    ['🚢💔🧊', 'Titanic'],
    ['🧙‍♂️💍🌋', 'The Lord of the Rings'],
    ['🕷️🧑', 'Spider-Man'],
    ['❄️👸⛄', 'Frozen'],
    ['🚀👨‍🚀🌕', 'Interstellar'],
    ['👻🚫', 'Ghostbusters'],
    ['🦖🏝️', 'Jurassic Park']
];
const FLAGS = [
    ['🇫🇷', 'France'], ['🇩🇪', 'Germany'], ['🇮🇹', 'Italy'], ['🇪🇸', 'Spain'],
    ['🇯🇵', 'Japan'], ['🇧🇷', 'Brazil'], ['🇨🇦', 'Canada'], ['🇦🇺', 'Australia'],
    ['🇸🇪', 'Sweden'], ['🇪🇬', 'Egypt'], ['🇮🇳', 'India'], ['🇲🇽', 'Mexico']
];
const CAPITALS = [
    ['France', 'Paris'], ['Germany', 'Berlin'], ['Italy', 'Rome'], ['Spain', 'Madrid'],
    ['Japan', 'Tokyo'], ['Canada', 'Ottawa'], ['Australia', 'Canberra'], ['Egypt', 'Cairo'],
    ['Brazil', 'Brasília'], ['Sweden', 'Stockholm'], ['Poland', 'Warsaw'], ['Morocco', 'Rabat']
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function norm(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ''); }
function scramble(word) {
    const a = [...word];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.join('') === word ? scramble(word) : a.join('');
}
function mask(word, guessed) {
    return [...word].map((c) => (guessed.includes(c) ? c : '_')).join(' ');
}
function wordleHint(secret, guess) {
    const s = [...secret];
    const g = [...guess];
    const out = Array(5).fill('⬛');
    const used = Array(5).fill(false);
    for (let i = 0; i < 5; i++) {
        if (g[i] === s[i]) { out[i] = '🟩'; used[i] = true; }
    }
    for (let i = 0; i < 5; i++) {
        if (out[i] === '🟩') continue;
        const idx = s.findIndex((ch, j) => !used[j] && ch === g[i]);
        if (idx >= 0) { out[i] = '🟨'; used[idx] = true; }
    }
    return out.join('');
}
function decodeHtml(s) {
    return String(s || '')
        .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&eacute;/g, 'é');
}
function mineGrid(size = 5, mines = 5) {
    const cells = Array(size * size).fill(0);
    let placed = 0;
    while (placed < mines) {
        const i = Math.floor(Math.random() * cells.length);
        if (cells[i] === -1) continue;
        cells[i] = -1;
        placed++;
    }
    const around = (i) => {
        const x = i % size; const y = Math.floor(i / size);
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx; const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            if (cells[ny * size + nx] === -1) n++;
        }}
        return n;
    };
    return cells.map((v, i) => (v === -1 ? '💣' : String(around(i) || '·')));
}

const TRIVIA_FALLBACK = [
    { q: 'What does HTML stand for?', answers: ['HyperText Markup Language', 'HighText Machine Language', 'Hyperlinks and Text Markup Language', 'Home Tool Markup Language'], correct: 0 },
    { q: 'Which planet is known as the Red Planet?', answers: ['Venus', 'Mars', 'Jupiter', 'Mercury'], correct: 1 },
    { q: 'What is the largest ocean on Earth?', answers: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3 },
    { q: 'Who painted the Mona Lisa?', answers: ['Van Gogh', 'Da Vinci', 'Picasso', 'Rembrandt'], correct: 1 }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('games')
        .setDescription('Mini-games: trivia, hangman, blackjack, wordle and more')
        .addSubcommand(s => s.setName('trivia').setDescription('Multiple-choice trivia'))
        .addSubcommand(s => s.setName('hangman').setDescription('Guess the word')
            .addStringOption(o => o.setName('letter').setDescription('Guess a letter').setMaxLength(1)))
        .addSubcommand(s => s.setName('guess').setDescription('Guess the number 1–100')
            .addIntegerOption(o => o.setName('number').setDescription('Your guess').setMinValue(1).setMaxValue(100)))
        .addSubcommand(s => s.setName('blackjack').setDescription('Play blackjack vs the dealer'))
        .addSubcommand(s => s.setName('minesweeper').setDescription('A spoiler minesweeper grid'))
        .addSubcommand(s => s.setName('riddle').setDescription('A riddle')
            .addStringOption(o => o.setName('answer').setDescription('Your answer')))
        .addSubcommand(s => s.setName('scramble').setDescription('Unscramble the word')
            .addStringOption(o => o.setName('word').setDescription('Your guess')))
        .addSubcommand(s => s.setName('wordle').setDescription('Guess the 5-letter word')
            .addStringOption(o => o.setName('guess').setDescription('5-letter guess').setMinLength(5).setMaxLength(5)))
        .addSubcommand(s => s.setName('tictactoe').setDescription('Tic-tac-toe vs the bot'))
        .addSubcommand(s => s.setName('roulette').setDescription('Spin a European roulette wheel')
            .addStringOption(o => o.setName('bet').setDescription('red, black, even, odd, or 0–36')))
        .addSubcommand(s => s.setName('higherlower').setDescription('Higher or lower?')
            .addStringOption(o => o.setName('call').setDescription('Your call')
                .addChoices({ name: 'Higher', value: 'higher' }, { name: 'Lower', value: 'lower' })))
        .addSubcommand(s => s.setName('emoji').setDescription('Guess the title from emoji')
            .addStringOption(o => o.setName('answer').setDescription('Your guess')))
        .addSubcommand(s => s.setName('flag').setDescription('Guess the country')
            .addStringOption(o => o.setName('answer').setDescription('Country name')))
        .addSubcommand(s => s.setName('capital').setDescription('Guess the capital city')
            .addStringOption(o => o.setName('answer').setDescription('Capital')))
        .addSubcommand(s => s.setName('sudoku').setDescription('A mini 4×4 sudoku'))
        .addSubcommand(s => s.setName('reaction').setDescription('How fast can you click?'))
        .addSubcommand(s => s.setName('anagram').setDescription('Find an anagram of a word')
            .addStringOption(o => o.setName('word').setDescription('Word').setRequired(true).setMaxLength(20)))
        .addSubcommand(s => s.setName('memory').setDescription('Memorize the sequence')
            .addStringOption(o => o.setName('recall').setDescription('Type the sequence if one is active')))
        .addSubcommand(s => s.setName('mathduel').setDescription('Solve a quick mental-math problem')
            .addIntegerOption(o => o.setName('answer').setDescription('Your answer')))
        .addSubcommand(s => s.setName('rps').setDescription('Rock-paper-scissors vs the bot')
            .addStringOption(o => o.setName('move').setDescription('Your move').setRequired(true)
                .addChoices({ name: 'Rock', value: 'rock' }, { name: 'Paper', value: 'paper' }, { name: 'Scissors', value: 'scissors' })))
        .addSubcommand(s => s.setName('dice').setDescription('Roll dice')
            .addIntegerOption(o => o.setName('sides').setDescription('Sides').setMinValue(2).setMaxValue(100))
            .addIntegerOption(o => o.setName('count').setDescription('How many').setMinValue(1).setMaxValue(10))),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        const reply = (p) => client.helpers.safeReply(interaction, p);
        const key = `${interaction.guildId}_${interaction.user.id}_${sub}`;

        if (sub === 'trivia') {
            let item = pick(TRIVIA_FALLBACK);
            try {
                if (!interaction.deferred && !interaction.replied) await interaction.deferReply().catch(() => {});
                const { data } = await axios.get('https://opentdb.com/api.php', {
                    timeout: 6000, params: { amount: 1, type: 'multiple' }
                });
                const row = data?.results?.[0];
                if (row) {
                    const answers = [...row.incorrect_answers.map(decodeHtml), decodeHtml(row.correct_answer)];
                    for (let i = answers.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [answers[i], answers[j]] = [answers[j], answers[i]];
                    }
                    item = { q: decodeHtml(row.question), answers, correct: answers.indexOf(decodeHtml(row.correct_answer)) };
                }
            } catch { /* local fallback */ }
            const game = put({ id: uid(), type: 'trivia', userId: interaction.user.id, ...item });
            const letters = ['A', 'B', 'C', 'D'];
            return reply({
                embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🧠 Trivia')
                    .setDescription(`**${game.q}**\n\n${game.answers.map((a, i) => `**${letters[i]}.** ${a}`).join('\n')}`)],
                components: triviaRows(game)
            });
        }

        if (sub === 'hangman') {
            const letterRaw = interaction.options.getString('letter');
            let game = get(key);
            if (!game || game.type !== 'hangman') {
                const word = pick(WORDS);
                game = put({ id: key, type: 'hangman', userId: interaction.user.id, word, guessed: [], misses: 0 });
            }
            if (letterRaw) {
                const letter = letterRaw.toLowerCase();
                if (!/^[a-z]$/.test(letter)) return reply({ content: '❌ Guess a single letter A–Z.', flags: [MessageFlags.Ephemeral] });
                if (!game.guessed.includes(letter)) {
                    game.guessed.push(letter);
                    if (!game.word.includes(letter)) game.misses++;
                }
                put(game);
            }
            const shown = mask(game.word, game.guessed);
            const lives = 6 - game.misses;
            if (!shown.includes('_')) {
                GAMES.delete(key);
                return reply({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('🎉 Hangman')
                    .setDescription(`You got it: **${game.word}**`)] });
            }
            if (lives <= 0) {
                GAMES.delete(key);
                return reply({ embeds: [new EmbedBuilder().setColor('#ef4444').setTitle('💀 Hangman')
                    .setDescription(`The word was **${game.word}**.`)] });
            }
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🪢 Hangman')
                .setDescription(`\`${shown}\`\nLives: **${lives}**\nGuessed: ${game.guessed.join(', ') || '—'}`)
                .setFooter({ text: 'Use /games hangman letter:<a>' })] });
        }

        if (sub === 'guess') {
            let game = get(key);
            if (!game || game.type !== 'guess') {
                game = put({ id: key, type: 'guess', userId: interaction.user.id, secret: 1 + Math.floor(Math.random() * 100), tries: 0 });
            }
            const n = interaction.options.getInteger('number');
            if (n == null) {
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔢 Guess')
                    .setDescription('I picked a number from **1–100**. Use `/games guess number:42`.')] });
            }
            game.tries++;
            put(game);
            if (n === game.secret) {
                GAMES.delete(key);
                return reply({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('🎯 Correct')
                    .setDescription(`**${n}** in ${game.tries} tries.`)] });
            }
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔢 Guess')
                .setDescription(n < game.secret ? '📈 Higher.' : '📉 Lower.')
                .setFooter({ text: `Try ${game.tries}` })] });
        }

        if (sub === 'blackjack') {
            const game = put({
                id: uid(), type: 'bj', userId: interaction.user.id,
                player: [drawCard(), drawCard()],
                dealer: [drawCard(), drawCard()]
            });
            if (bjValue(game.player) === 21) {
                return reply({ embeds: [bjEmbed(game, true, '🃏 Blackjack!')], components: bjButtons(game, true) });
            }
            return reply({ embeds: [bjEmbed(game)], components: bjButtons(game) });
        }

        if (sub === 'minesweeper') {
            const grid = mineGrid(5, 5);
            const rows = [];
            for (let y = 0; y < 5; y++) {
                rows.push(grid.slice(y * 5, y * 5 + 5).map((c) => `||${c}||`).join(' '));
            }
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('💣 Minesweeper')
                .setDescription(rows.join('\n')).setFooter({ text: '5×5 · 5 mines · click spoilers' })] });
        }

        if (sub === 'riddle') {
            const answer = interaction.options.getString('answer');
            let game = get(key);
            if (!game || game.type !== 'riddle') {
                const [q, a] = pick(RIDDLES);
                game = put({ id: key, type: 'riddle', userId: interaction.user.id, q, a });
            }
            if (!answer) {
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🧩 Riddle')
                    .setDescription(game.q).setFooter({ text: 'Use /games riddle answer:…' })] });
            }
            if (norm(answer).includes(norm(game.a)) || norm(game.a).includes(norm(answer))) {
                GAMES.delete(key);
                return reply({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('✅ Riddle').setDescription(`Yes — **${game.a}**.`)] });
            }
            return reply({ content: '❌ Not quite. Try again, or run `/games riddle` for a new one.' });
        }

        if (sub === 'scramble') {
            const guess = interaction.options.getString('word');
            let game = get(key);
            if (!game || game.type !== 'scramble') {
                const word = pick(WORDS);
                game = put({ id: key, type: 'scramble', userId: interaction.user.id, word, mixed: scramble(word) });
            }
            if (!guess) {
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔤 Scramble')
                    .setDescription(`Unscramble: **${game.mixed}**`).setFooter({ text: 'Use /games scramble word:…' })] });
            }
            if (norm(guess) === norm(game.word)) {
                GAMES.delete(key);
                return reply({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('✅ Scramble').setDescription(`**${game.word}**`)] });
            }
            return reply({ content: '❌ Nope. Keep trying.' });
        }

        if (sub === 'wordle') {
            let game = get(key);
            if (!game || game.type !== 'wordle') {
                game = put({ id: key, type: 'wordle', userId: interaction.user.id, secret: pick(WORDLE), rows: [] });
            }
            const guess = (interaction.options.getString('guess') || '').toLowerCase();
            if (!guess) {
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🟩 Wordle')
                    .setDescription(game.rows.join('\n') || 'Guess a 5-letter word.')
                    .setFooter({ text: `${game.rows.length}/6 · /games wordle guess:crane` })] });
            }
            if (!/^[a-z]{5}$/.test(guess)) return reply({ content: '❌ Exactly 5 letters.', flags: [MessageFlags.Ephemeral] });
            const line = `${wordleHint(game.secret, guess)} \`${guess}\``;
            game.rows.push(line);
            put(game);
            if (guess === game.secret) {
                GAMES.delete(key);
                return reply({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('🟩 Wordle')
                    .setDescription(`${game.rows.join('\n')}\n\n**${game.secret}** in ${game.rows.length}.`)] });
            }
            if (game.rows.length >= 6) {
                GAMES.delete(key);
                return reply({ embeds: [new EmbedBuilder().setColor('#ef4444').setTitle('🟩 Wordle')
                    .setDescription(`${game.rows.join('\n')}\n\nThe word was **${game.secret}**.`)] });
            }
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🟩 Wordle')
                .setDescription(game.rows.join('\n')).setFooter({ text: `${game.rows.length}/6` })] });
        }

        if (sub === 'tictactoe') {
            const game = put({ id: uid(), type: 'ttt', userId: interaction.user.id, board: Array(9).fill(null) });
            return reply({
                embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(' Tic-Tac-Toe').setDescription('You are ❌ — tap a square.')],
                components: tttRows(game)
            });
        }

        if (sub === 'roulette') {
            const n = Math.floor(Math.random() * 37);
            const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
            const color = n === 0 ? 'green' : red.has(n) ? 'red' : 'black';
            const bet = (interaction.options.getString('bet') || '').toLowerCase().trim();
            let result = `Ball landed on **${n}** (${color}).`;
            if (bet) {
                let win = false;
                if (bet === color) win = true;
                else if (bet === 'even') win = n !== 0 && n % 2 === 0;
                else if (bet === 'odd') win = n % 2 === 1;
                else if (/^\d{1,2}$/.test(bet) && Number(bet) === n) win = true;
                result += win ? '\n🎉 **You win.**' : '\n💀 **You lose.**';
            }
            return reply({ embeds: [new EmbedBuilder().setColor(color === 'red' ? '#ef4444' : color === 'black' ? '#111827' : '#22c55e')
                .setTitle('🎡 Roulette').setDescription(result)] });
        }

        if (sub === 'higherlower') {
            let game = get(key);
            if (!game || game.type !== 'hl') {
                game = put({ id: key, type: 'hl', userId: interaction.user.id, current: 1 + Math.floor(Math.random() * 13), score: 0 });
            }
            const call = interaction.options.getString('call');
            if (!call) {
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('⬆️ Higher / Lower')
                    .setDescription(`Current card: **${game.current}**\nCall with \`/games higherlower call:higher\`.`)] });
            }
            const next = 1 + Math.floor(Math.random() * 13);
            const ok = call === 'higher' ? next >= game.current : next <= game.current;
            if (ok) {
                game.current = next;
                game.score++;
                put(game);
                return reply({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('⬆️ Higher / Lower')
                    .setDescription(`Next was **${next}**. Streak **${game.score}**. Keep going.`)] });
            }
            GAMES.delete(key);
            return reply({ embeds: [new EmbedBuilder().setColor('#ef4444').setTitle('⬇️ Higher / Lower')
                .setDescription(`Next was **${next}**. Streak ended at **${game.score}**.`)] });
        }

        if (sub === 'emoji' || sub === 'flag' || sub === 'capital') {
            const pools = { emoji: EMOJI_QUIZ, flag: FLAGS, capital: CAPITALS };
            const titles = { emoji: '🎬 Emoji', flag: '🚩 Flag', capital: '🏙️ Capital' };
            const answer = interaction.options.getString('answer');
            let game = get(key);
            if (!game || game.type !== sub) {
                const [prompt, a] = pick(pools[sub]);
                game = put({ id: key, type: sub, userId: interaction.user.id, prompt, a });
            }
            if (!answer) {
                const q = sub === 'capital' ? `What is the capital of **${game.prompt}**?` : game.prompt;
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(titles[sub])
                    .setDescription(q).setFooter({ text: `Use /games ${sub} answer:…` })] });
            }
            if (norm(answer) === norm(game.a) || norm(answer).includes(norm(game.a))) {
                GAMES.delete(key);
                return reply({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle(titles[sub])
                    .setDescription(`**${game.a}**`)] });
            }
            return reply({ content: '❌ Not it. Try again.' });
        }

        if (sub === 'sudoku') {
            const grid = [
                '2 · · 1',
                '· 1 2 ·',
                '· 2 1 ·',
                '1 · · 2'
            ].join('\n');
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔢 Mini Sudoku 4×4')
                .setDescription('```\n' + grid + '\n```\nFill 1–2 so each row and column has no repeats.\nOne solution: `2 1 | 1 2` on the blanks, alternating.')] });
        }

        if (sub === 'reaction') {
            const game = put({ id: uid(), type: 'react', userId: interaction.user.id });
            return reply({
                embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('⚡ Reaction').setDescription('Hit the button.')],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`game_react:${game.id}`).setLabel('NOW').setStyle(ButtonStyle.Success)
                )]
            });
        }

        if (sub === 'anagram') {
            const word = interaction.options.getString('word').toLowerCase().replace(/[^a-z]/g, '');
            if (word.length < 3) return reply({ content: '❌ Need at least 3 letters.', flags: [MessageFlags.Ephemeral] });
            const mixed = scramble(word);
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🔀 Anagram')
                .setDescription(`**${word}** → **${mixed}**`)] });
        }

        if (sub === 'memory') {
            const recall = interaction.options.getString('recall');
            let game = get(key);
            if (recall && game?.type === 'memory') {
                if (norm(recall) === norm(game.seq)) {
                    GAMES.delete(key);
                    return reply({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('🧠 Memory').setDescription('Perfect recall.')] });
                }
                return reply({ content: '❌ Not the sequence. Run `/games memory` for a new one.' });
            }
            const seq = Array.from({ length: 5 }, () => pick(['▲', '●', '■', '◆', '★'])).join(' ');
            put({ id: key, type: 'memory', userId: interaction.user.id, seq });
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🧠 Memory')
                .setDescription(`Remember:\n# ${seq}\n\nThen use \`/games memory recall:…\` (copy the symbols).`)] });
        }

        if (sub === 'mathduel') {
            let game = get(key);
            if (!game || game.type !== 'math') {
                const a = 2 + Math.floor(Math.random() * 20);
                const b = 2 + Math.floor(Math.random() * 12);
                const ops = [
                    { e: `${a} + ${b}`, v: a + b },
                    { e: `${a} − ${b}`, v: a - b },
                    { e: `${a} × ${b}`, v: a * b }
                ];
                const p = pick(ops);
                game = put({ id: key, type: 'math', userId: interaction.user.id, ...p });
            }
            const ans = interaction.options.getInteger('answer');
            if (ans == null) {
                return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🧮 Math duel')
                    .setDescription(`What is **${game.e}**?`).setFooter({ text: '/games mathduel answer:…' })] });
            }
            if (ans === game.v) {
                GAMES.delete(key);
                return reply({ embeds: [new EmbedBuilder().setColor('#22c55e').setTitle('🧮 Math duel').setDescription(`**${game.e} = ${game.v}**`)] });
            }
            return reply({ content: '❌ Wrong. Try another answer.' });
        }

        if (sub === 'dice') {
            const sides = interaction.options.getInteger('sides') || 6;
            const count = interaction.options.getInteger('count') || 1;
            const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
            const total = rolls.reduce((a, b) => a + b, 0);
            return reply({ embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('🎲 Dice')
                .setDescription(`**${rolls.join(' · ')}**${count > 1 ? `\nTotal **${total}**` : ''}`)
                .setFooter({ text: `${count}× d${sides}` })] });
        }

        if (sub === 'rps') {
            const you = interaction.options.getString('move');
            const bot = pick(['rock', 'paper', 'scissors']);
            const emoji = { rock: '🪨', paper: '📄', scissors: '✂️' };
            const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
            let result = "It's a tie!";
            let color = '#FFA500';
            if (beats[you] === bot) { result = 'You win!'; color = '#22c55e'; }
            else if (beats[bot] === you) { result = 'You lose!'; color = '#ef4444'; }
            return reply({ embeds: [new EmbedBuilder().setColor(color).setTitle('✊ Games · RPS')
                .addFields(
                    { name: 'You', value: `${emoji[you]} ${you}`, inline: true },
                    { name: 'Bot', value: `${emoji[bot]} ${bot}`, inline: true },
                    { name: 'Result', value: `**${result}**` }
                )] });
        }
    }
};
