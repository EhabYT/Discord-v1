const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('move')
        .setDescription('Move a member to another voice channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
        .addUserOption(opt => opt.setName('user').setDescription('Member').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Voice channel').setRequired(true).addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)),

    async execute(interaction, client) {
        const user = interaction.options.getUser('user');
        const channel = interaction.options.getChannel('channel');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member?.voice?.channel) {
            return client.helpers.safeReply(interaction, { content: '❌ That member is not in a voice channel.', flags: [MessageFlags.Ephemeral] });
        }
        try {
            await member.voice.setChannel(channel, `Moved by ${interaction.user.tag}`);
            const embed = new EmbedBuilder()
                .setColor('#00fbff')
                .setDescription(`➡️ Moved ${member} to ${channel}.`);
            await client.helpers.safeReply(interaction, { embeds: [embed] });
        } catch (err) {
            await client.helpers.safeReply(interaction, { content: `❌ ${err.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};
