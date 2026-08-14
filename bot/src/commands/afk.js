const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set or clear your AFK status')
        .addStringOption(opt => opt.setName('reason').setDescription('Why you are AFK').setMaxLength(200)),

    async execute(interaction, client, db) {
        const reason = interaction.options.getString('reason') || 'AFK';
        const key = `afk_${interaction.guild.id}_${interaction.user.id}`;
        const existing = await db.get(key);

        if (existing && !interaction.options.getString('reason')) {
            await db.delete(key);
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setDescription(`👋 Welcome back ${interaction.user}, I removed your AFK.`)
                .setTimestamp();
            return client.helpers.safeReply(interaction, { embeds: [embed] });
        }

        await db.set(key, { reason, since: Date.now() });
        const embed = new EmbedBuilder()
            .setColor('#00fbff')
            .setTitle('💤 AFK set')
            .setDescription(`${interaction.user} is now AFK: **${reason}**`)
            .setTimestamp();
        await client.helpers.safeReply(interaction, { embeds: [embed] });
    }
};
