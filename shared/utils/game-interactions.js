const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const GAMES = new Map();
const TTL = 10 * 60 * 1000;

function prune() {
    const now = Date.now();
    for (const [id, g] of GAMES) {
        if (now - g.ts > TTL) GAMES.delete(id);
    }
}

function put(game) {
    prune();
    game.ts = Date.now();
    GAMES.set(game.id, game);
    return game;
}

function get(id) {
    prune();
    return GAMES.get(id) || null;
}

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

function triviaRows(game) {
    return [new ActionRowBuilder().addComponents(
        game.answers.map((label, i) => new ButtonBuilder()
            .setCustomId(`game_trivia:${game.id}:${i}`)
            .setLabel(`${['A', 'B', 'C', 'D'][i]}`)
            .setStyle(ButtonStyle.Secondary))
    )];
}

function tttSymbol(cell) {
    if (cell === 'X') return '❌';
    if (cell === 'O') return '⭕';
    return '·';
}

function tttWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    if (board.every(Boolean)) return 'tie';
    return null;
}

function tttRows(game, disabled = false) {
    const rows = [];
    for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
            const i = r * 3 + c;
            const cell = game.board[i];
            row.addComponents(new ButtonBuilder()
                .setCustomId(`game_ttt:${game.id}:${i}`)
                .setLabel(cell ? tttSymbol(cell) : `${i + 1}`)
                .setStyle(cell === 'X' ? ButtonStyle.Danger : cell === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(disabled || !!cell));
        }
        rows.push(row);
    }
    return rows;
}

function botMove(board) {
    const empty = board.map((v, i) => (v ? null : i)).filter((v) => v !== null);
    if (!empty.length) return -1;
    for (const mark of ['O', 'X']) {
        for (const i of empty) {
            const copy = board.slice();
            copy[i] = mark;
            if (tttWinner(copy) === mark) return i;
        }
    }
    if (empty.includes(4)) return 4;
    return empty[Math.floor(Math.random() * empty.length)];
}

function bjValue(hand) {
    let total = 0;
    let aces = 0;
    for (const c of hand) {
        if (c.v === 1) { aces++; total += 11; }
        else total += c.v;
    }
    while (total > 21 && aces) { total -= 10; aces--; }
    return total;
}

function cardLabel(c) {
    return `${c.r}${c.s}`;
}

function drawCard() {
    const ranks = [
        { r: 'A', v: 1 }, { r: '2', v: 2 }, { r: '3', v: 3 }, { r: '4', v: 4 },
        { r: '5', v: 5 }, { r: '6', v: 6 }, { r: '7', v: 7 }, { r: '8', v: 8 },
        { r: '9', v: 9 }, { r: '10', v: 10 }, { r: 'J', v: 10 }, { r: 'Q', v: 10 }, { r: 'K', v: 10 }
    ];
    const suits = ['♠', '♥', '♦', '♣'];
    const c = ranks[Math.floor(Math.random() * ranks.length)];
    return { ...c, s: suits[Math.floor(Math.random() * suits.length)] };
}

function bjEmbed(game, reveal = false, title = '🃏 Blackjack') {
    const you = game.player.map(cardLabel).join(' ');
    const dealer = reveal
        ? game.dealer.map(cardLabel).join(' ')
        : `${cardLabel(game.dealer[0])} ▮▮`;
    const youV = bjValue(game.player);
    const dealerV = reveal ? bjValue(game.dealer) : '?';
    return new EmbedBuilder().setColor('#00fbff').setTitle(title)
        .addFields(
            { name: `You · ${youV}`, value: you || '—' },
            { name: `Dealer · ${dealerV}`, value: dealer }
        );
}

function bjButtons(game, done = false) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`game_bj:${game.id}:hit`).setLabel('Hit').setStyle(ButtonStyle.Success).setDisabled(done),
        new ButtonBuilder().setCustomId(`game_bj:${game.id}:stand`).setLabel('Stand').setStyle(ButtonStyle.Danger).setDisabled(done)
    )];
}

function ownerOnly(interaction, game) {
    if (interaction.user.id !== game.userId) {
        return interaction.reply({ content: '❌ This is not your game.', flags: [MessageFlags.Ephemeral] }).then(() => true).catch(() => true);
    }
    return false;
}

async function handleGameButton(interaction) {
    const id = interaction.customId || '';
    if (id.startsWith('game_trivia:')) {
        const [, gid, idx] = id.split(':');
        const game = get(gid);
        if (!game) return interaction.reply({ content: '⌛ This trivia expired.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
        if (await ownerOnly(interaction, game)) return;
        const pick = Number(idx);
        const ok = pick === game.correct;
        GAMES.delete(gid);
        const embed = new EmbedBuilder()
            .setColor(ok ? '#22c55e' : '#ef4444')
            .setTitle(ok ? '✅ Correct!' : '❌ Wrong')
            .setDescription(`**${game.q}**\nAnswer: **${game.answers[game.correct]}**`);
        return interaction.update({ embeds: [embed], components: [] }).catch(() => {});
    }

    if (id.startsWith('game_ttt:')) {
        const [, gid, pos] = id.split(':');
        const game = get(gid);
        if (!game) return interaction.reply({ content: '⌛ This game expired.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
        if (await ownerOnly(interaction, game)) return;
        const i = Number(pos);
        if (game.board[i]) return interaction.deferUpdate().catch(() => {});
        game.board[i] = 'X';
        let winner = tttWinner(game.board);
        if (!winner) {
            const mv = botMove(game.board);
            if (mv >= 0) game.board[mv] = 'O';
            winner = tttWinner(game.board);
        }
        put(game);
        if (winner) {
            GAMES.delete(gid);
            const title = winner === 'tie' ? '🤝 Tie' : winner === 'X' ? '🎉 You win' : '🤖 Bot wins';
            return interaction.update({
                embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(` Tic-Tac-Toe · ${title}`)],
                components: tttRows(game, true)
            }).catch(() => {});
        }
        return interaction.update({
            embeds: [new EmbedBuilder().setColor('#00fbff').setTitle(' Tic-Tac-Toe').setDescription('Your move (❌)')],
            components: tttRows(game)
        }).catch(() => {});
    }

    if (id.startsWith('game_bj:')) {
        const [, gid, act] = id.split(':');
        const game = get(gid);
        if (!game) return interaction.reply({ content: '⌛ This hand expired.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
        if (await ownerOnly(interaction, game)) return;
        if (act === 'hit') {
            game.player.push(drawCard());
            put(game);
            if (bjValue(game.player) > 21) {
                GAMES.delete(gid);
                return interaction.update({
                    embeds: [bjEmbed(game, true, '💥 Bust')],
                    components: bjButtons(game, true)
                }).catch(() => {});
            }
            return interaction.update({ embeds: [bjEmbed(game)], components: bjButtons(game) }).catch(() => {});
        }
        while (bjValue(game.dealer) < 17) game.dealer.push(drawCard());
        const you = bjValue(game.player);
        const dealer = bjValue(game.dealer);
        let title = '🤝 Push';
        if (dealer > 21 || you > dealer) title = '🎉 You win';
        else if (you < dealer) title = '🤖 Dealer wins';
        GAMES.delete(gid);
        return interaction.update({
            embeds: [bjEmbed(game, true, title)],
            components: bjButtons(game, true)
        }).catch(() => {});
    }

    if (id.startsWith('game_react:')) {
        const [, gid] = id.split(':');
        const game = get(gid);
        if (!game) return interaction.reply({ content: '⌛ Too late.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
        const ms = Date.now() - game.ts;
        GAMES.delete(gid);
        return interaction.update({
            embeds: [new EmbedBuilder().setColor('#00fbff').setTitle('⚡ Reaction')
                .setDescription(`${interaction.user} reacted in **${ms}ms**.`)],
            components: []
        }).catch(() => {});
    }
}

module.exports = {
    GAMES, put, get, uid, triviaRows, tttRows, bjEmbed, bjButtons, drawCard, bjValue,
    handleGameButton
};
