const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { safeReply } = require('../../../shared/utils/discord');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure AutoMod settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt => opt.setName('feature')
      .setDescription('AutoMod feature')
      .setRequired(true)
      .addChoices(
        { name: 'Spam Detection', value: 'spam' },
        { name: 'Profanity Filter', value: 'profanity' },
        { name: 'Link Protection', value: 'links' },
        { name: 'CAPS Detection', value: 'caps' },
        { name: 'Emoji Spam', value: 'emojis' },
        { name: 'Mention Spam', value: 'mentions' }
      ))
    .addStringOption(opt => opt.setName('action')
      .setDescription('Action to perform')
      .setRequired(true)
      .addChoices(
        { name: 'Enable', value: 'enable' },
        { name: 'Disable', value: 'disable' },
        { name: 'Status', value: 'status' }
      ))
    .addIntegerOption(opt => opt.setName('threshold')
      .setDescription('Threshold value')
      .setMinValue(1)
      .setMaxValue(100)),

  async execute(interaction, client, db) {
    const feature = interaction.options.getString('feature');
    const action = interaction.options.getString('action');
    const threshold = interaction.options.getInteger('threshold');
    const config = await db.get(`automod_${interaction.guild.id}`) || {};

    if (action === 'status') {
      const featureConfig = config[feature] || { enabled: false };
      const embed = new EmbedBuilder()
        .setColor(featureConfig.enabled ? '#2ed573' : '#ff4757')
        .setTitle(`🛡️ AutoMod Status: ${feature.charAt(0).toUpperCase() + feature.slice(1)}`)
        .addFields(
          { name: 'Status', value: featureConfig.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Threshold', value: `${featureConfig.threshold || 'Default'}`, inline: true }
        )
        .setTimestamp();
      return safeReply(interaction, { embeds: [embed] });
    }

    if (action === 'enable') {
      const defaults = { spam: 5, profanity: null, links: 3, caps: 70, emojis: 10, mentions: 5 };
      config[feature] = {
        enabled: true,
        threshold: threshold || config[feature]?.threshold || defaults[feature]
      };
      await db.set(`automod_${interaction.guild.id}`, config);
      const embed = new EmbedBuilder()
        .setColor('#2ed573')
        .setTitle('✅ AutoMod Feature Enabled')
        .setDescription(`**${feature}** protection is now active.`)
        .addFields({ name: 'Threshold', value: `${config[feature].threshold || 'N/A'}`, inline: true })
        .setTimestamp();
      return safeReply(interaction, { embeds: [embed] });
    }

    if (action === 'disable') {
      if (config[feature]) {
        config[feature].enabled = false;
        await db.set(`automod_${interaction.guild.id}`, config);
      }
      const embed = new EmbedBuilder()
        .setColor('#ff4757')
        .setTitle('❌ AutoMod Feature Disabled')
        .setDescription(`**${feature}** protection has been deactivated.`)
        .setTimestamp();
      return safeReply(interaction, { embeds: [embed] });
    }
  }
};
