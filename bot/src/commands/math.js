const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

function safeEval(expr) {
    if (typeof expr !== 'string' || expr.length > 100) return null;
    const cleaned = expr.replace(/\s+/g, '');
    if (!cleaned || !/^[0-9+\-*/().%^]+$/.test(cleaned)) return null;
    const js = cleaned.replace(/\^/g, '**');
    try {
        const fn = new Function(`"use strict"; return (${js});`);
        const result = fn();
        if (typeof result !== 'number' || !Number.isFinite(result)) return null;
        return result;
    } catch {
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('math')
        .setDescription('Evaluate a math expression')
        .addStringOption(opt => opt.setName('expression').setDescription('e.g. (12+8)*3 or 2^8').setRequired(true)),

    async execute(interaction, client) {
        const expr = interaction.options.getString('expression');
        const result = safeEval(expr);
        if (result === null) {
            return client.helpers.safeReply(interaction, { content: '❌ Invalid expression. Use numbers and + - * / % ^ ( ).', flags: [MessageFlags.Ephemeral] });
        }
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle('🧮 Result')
            .addFields(
                { name: 'Expression', value: `\`${expr}\`` },
                { name: 'Answer', value: `**${result}**` }
            );
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
