const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('define')
        .setDescription('Look up a word in the dictionary')
        .addStringOption(opt => opt.setName('word').setDescription('Word to define').setRequired(true)),
    defer: true,

    async execute(interaction, client) {
        const word = interaction.options.getString('word').trim();
        try {
            const { data } = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { timeout: 8000 });
            const entry = data[0];
            const meaning = entry.meanings?.[0];
            const def = meaning?.definitions?.[0];
            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setTitle(`📖 ${entry.word}`)
                .setDescription(def?.definition || 'No definition found.')
                .addFields(
                    { name: 'Part of speech', value: meaning?.partOfSpeech || '—', inline: true },
                    { name: 'Example', value: def?.example || '—', inline: true }
                )
                .setTimestamp();
            if (entry.phonetic) embed.setFooter({ text: entry.phonetic });
            await client.helpers.safeReply(interaction, { embeds: [embed] });
        } catch {
            await client.helpers.safeReply(interaction, { content: `❌ No definition found for **${word}**.`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
