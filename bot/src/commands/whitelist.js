const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Manage AutoMod whitelist')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt => opt.setName('type').setDescription('Whitelist type').setRequired(true)
      .addChoices(
        { name: 'User', value: 'user' },
        { name: 'Role', value: 'role' },
        { name: 'Channel', value: 'channel' }
      ))
    .addStringOption(opt => opt.setName('action').setDescription('Action').setRequired(true)
      .addChoices(
        { name: 'Add', value: 'add' },
        { name: 'Remove', value: 'remove' },
        { name: 'List', value: 'list' }
      ))
    .addStringOption(opt => opt.setName('target').setDescription('User/Role/Channel ID or mention')),

  async execute(interaction, client, db) {
    const type = interaction.options.getString('type');
    const action = interaction.options.getString('action');
    const target = interaction.options.getString('target');
    const whitelist = await db.get(`automod_whitelist_${interaction.guild.id}`) || { users: [], roles: [], channels: [] };
    const typeMap = { user: 'users', role: 'roles', channel: 'channels' };
    const listKey = typeMap[type];

    if (action === 'list') {
      const items = whitelist[listKey] || [];
      let description = '';
      if (items.length === 0) {
        description = 'No items on the whitelist.';
      } else {
        const prefix = { users: '<@', roles: '<@&', channels: '<#' }[listKey];
        description = items.map(id => `${prefix}${id}>`).join('\n');
      }
      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle(`📋 Whitelist: ${type}s`)
        .setDescription(description)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (!target) {
      return interaction.reply({ content: '❌ Please provide a target for add/remove.', flags: [MessageFlags.Ephemeral] });
    }

    const idMatch = target.match(/(\d{17,20})/);
    if (!idMatch) {
      return interaction.reply({ content: '❌ Invalid target.', flags: [MessageFlags.Ephemeral] });
    }
    const targetId = idMatch[1];

    if (action === 'add') {
      if (!whitelist[listKey].includes(targetId)) {
        whitelist[listKey].push(targetId);
        await db.set(`automod_whitelist_${interaction.guild.id}`, whitelist);
      }
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Whitelist Updated')
        .setDescription(`Added to ${type} whitelist: ${target}`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    if (action === 'remove') {
      whitelist[listKey] = whitelist[listKey].filter(id => id !== targetId);
      await db.set(`automod_whitelist_${interaction.guild.id}`, whitelist);
      const embed = new EmbedBuilder()
        .setColor('#FF6600')
        .setTitle('✅ Whitelist Updated')
        .setDescription(`Removed from ${type} whitelist: ${target}`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
  }
};
