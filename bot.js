const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ChannelType, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits, 
  PermissionsBitField,
  ActivityType, 
  AttachmentBuilder 
} = require('discord.js');

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const EXCHANGER_ROLE_ID = '1532005989879124129';

// Helper to reliably check if a member has the required staff role (<@&1532005989879124129>) or admin perms
async function isStaffMember(memberOrUser, guild) {
  if (!memberOrUser) return false;

  // Direct check if memberOrUser object has roles array or cache
  if (memberOrUser.roles) {
    if (memberOrUser.roles.cache && typeof memberOrUser.roles.cache.has === 'function') {
      if (memberOrUser.roles.cache.has(EXCHANGER_ROLE_ID)) return true;
    } else if (Array.isArray(memberOrUser.roles)) {
      if (memberOrUser.roles.includes(EXCHANGER_ROLE_ID)) return true;
    }
  }

  if (Array.isArray(memberOrUser._roles)) {
    if (memberOrUser._roles.includes(EXCHANGER_ROLE_ID)) return true;
  }

  // Permission check
  if (memberOrUser.permissions) {
    try {
      if (typeof memberOrUser.permissions.has === 'function') {
        if (memberOrUser.permissions.has(PermissionFlagsBits.Administrator) || 
            memberOrUser.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return true;
        }
      } else if (typeof memberOrUser.permissions === 'string' || typeof memberOrUser.permissions === 'bigint') {
        const perms = new PermissionsBitField(BigInt(memberOrUser.permissions));
        if (perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild)) {
          return true;
        }
      }
    } catch (e) {}
  }

  // Fallback: Fetch full member from guild if available
  if (guild) {
    const memberId = memberOrUser.id || (typeof memberOrUser === 'string' ? memberOrUser : null);
    if (memberId) {
      try {
        const fetchedMember = await guild.members.fetch(memberId).catch(() => null);
        if (fetchedMember && fetchedMember.roles) {
          if (fetchedMember.roles.cache && fetchedMember.roles.cache.has(EXCHANGER_ROLE_ID)) {
            return true;
          }
          if (fetchedMember.permissions && typeof fetchedMember.permissions.has === 'function' && 
             (fetchedMember.permissions.has(PermissionFlagsBits.Administrator) || 
              fetchedMember.permissions.has(PermissionFlagsBits.ManageGuild))) {
            return true;
          }
        }
      } catch (e) {}
    }
  }

  return false;
}

const TRANSCRIPT_CHANNEL_ID = '1531286414757593178';
const HISTORY_CHANNEL_ID = '1531286413289656411';
const RULES_CHANNEL_ID = '1531286418025091171';
const CATEGORY_ID = '1531286420550062130';
const LOG_CHANNEL_ID = '1531286413289656411';

// Dynamic deal ID counter
let dealCounter = 5860;

client.once('ready', () => {
  console.log(`[BOT IS ONLINE] Logged in as ${client.user.tag}`);
  
  // Set custom streaming activity
  client.user.setPresence({
    activities: [{
      name: 'Exchanging & Tickets',
      type: ActivityType.Streaming,
      url: 'https://www.twitch.tv/discord'
    }],
    status: 'dnd'
  });
});

// Helper function to build ticket panel message components
function buildTicketPanel() {
  const panelEmbed = new EmbedBuilder()
    .setTitle('<a:rizz_pinksparkles:1531330172421406720> Cozy Exchange Service')
    .setDescription(
      `Welcome to **Cozy Exchange**!\n\n` +
      `Choose a exchange type from the dropdown menu below to open a ticket.\n\n` +
      `<a:rizz_tick:1531330187160064030> **In-Game to Crypto (I2C)**\n` +
      ` Exchange in-game items/currency for Crypto.\n\n` +
      `<a:rizz_tick:1531330187160064030> **Crypto to In-Game (C2I)**\n` +
      ` Exchange Crypto for in-game items/currency.\n\n` +
      `<a:rizz_tick:1531330187160064030> **Crypto to Crypto (C2C)**\n` +
      ` Exchange one Cryptocurrency for another.\n\n` +
      `🔒 *All exchanges are secured by our staff.*`
    )
    .setColor(0x2b2d31)
    .setImage('https://media.discordapp.net/attachments/1210884639943491635/1210884826883489812/Cozy_Exchange.png')
    .setFooter({ text: 'Cozy Exchange • Secure & Fast Service' });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_type_select')
    .setPlaceholder('Select Exchange Type...')
    .addOptions([
      {
        label: 'In-Game to Crypto (I2C)',
        description: 'Exchange in-game items/currency for Crypto',
        value: 'i2c',
        emoji: '🎮'
      },
      {
        label: 'Crypto to In-Game (C2I)',
        description: 'Exchange Crypto for in-game items/currency',
        value: 'c2i',
        emoji: '💸'
      },
      {
        label: 'Crypto to Crypto (C2C)',
        description: 'Exchange one Cryptocurrency for another',
        value: 'c2c',
        emoji: '🔄'
      }
    ]);

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return { embeds: [panelEmbed], components: [row] };
}

// Handle text commands
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  const lowerContent = content.toLowerCase();

  // Command: !panel, .panel, !setup, .setup
  if (['!panel', '.panel', '!setup', '.setup'].includes(lowerContent)) {
    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      return message.reply({ embeds: [errEmbed] });
    }

    const panelData = buildTicketPanel();
    await message.channel.send(panelData);
    if (message.deletable) await message.delete().catch(() => {});
    return;
  }

  // Command: .done, .dn (Close ticket command)
  if (['.done', '.dn', '!done', '!dn'].includes(lowerContent)) {
    if (!message.channel.name.startsWith('ticket-') && 
        !message.channel.name.startsWith('claimed-') && 
        !message.channel.name.startsWith('closed-')) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside a ticket channel!**');
      return message.reply({ embeds: [errEmbed] });
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      return message.reply({ embeds: [errEmbed] });
    }

    const closeEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('🔒 Ticket Closing')
      .setDescription(`Ticket closed by ${message.author}. Channel will be deleted in 5 seconds...`);

    await message.channel.send({ embeds: [closeEmbed] });

    setTimeout(async () => {
      try {
        await message.channel.delete();
      } catch (e) {
        console.error('Error deleting channel:', e);
      }
    }, 5000);
    return;
  }

  // Command: .c (Claim command)
  if (['.c', '!c'].includes(lowerContent)) {
    if (!message.channel.name.startsWith('ticket-') && !message.channel.name.startsWith('claimed-')) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside a ticket channel!**');
      return message.reply({ embeds: [errEmbed] });
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      return message.reply({ embeds: [errEmbed] });
    }

    const newChannelName = message.channel.name.replace(/^ticket-/, 'claimed-');
    await message.channel.setName(newChannelName).catch(() => {});

    const claimEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(`<a:rizz_tick:1531330187160064030> **Ticket Claimed!**\n\nThis ticket is now being handled by ${message.author}.`);

    await message.channel.send({ embeds: [claimEmbed] });
    return;
  }

  // Command: .u (Unclaim command)
  if (['.u', '!u'].includes(lowerContent)) {
    if (!message.channel.name.startsWith('claimed-') && !message.channel.name.startsWith('ticket-')) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside a ticket channel!**');
      return message.reply({ embeds: [errEmbed] });
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      return message.reply({ embeds: [errEmbed] });
    }

    const newChannelName = message.channel.name.replace(/^claimed-/, 'ticket-');
    await message.channel.setName(newChannelName).catch(() => {});

    const unclaimEmbed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setDescription(`🟡 **Ticket Unclaimed!**\n\n${message.author} has unclaimed this ticket. It is now open for other staff.`);

    await message.channel.send({ embeds: [unclaimEmbed] });
    return;
  }

  // Public Ticket Commands: .i2c, .c2i, .c2c
  if (['.i2c', '!i2c', '.c2i', '!c2i', '.c2c', '!c2c'].includes(lowerContent)) {
    const type = lowerContent.replace(/^[.!]/, '');
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_${type}`)
      .setTitle(`Create ${type.toUpperCase()} Ticket`);

    const sendMethodInput = new TextInputBuilder()
      .setCustomId('sending_method')
      .setLabel('Sending Method')
      .setPlaceholder('e.g. PayPal, Crypto, Robux, CashApp')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const recvCryptoInput = new TextInputBuilder()
      .setCustomId('receiving_crypto')
      .setLabel('Receiving Crypto / Method')
      .setPlaceholder('e.g. USDT, LTC, BTC')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const dealAmountInput = new TextInputBuilder()
      .setCustomId('deal_amount')
      .setLabel('Deal Amount ($ or Currency)')
      .setPlaceholder('e.g. $50 or 50 USDT')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const row1 = new ActionRowBuilder().addComponents(sendMethodInput);
    const row2 = new ActionRowBuilder().addComponents(recvCryptoInput);
    const row3 = new ActionRowBuilder().addComponents(dealAmountInput);

    modal.addComponents(row1, row2, row3);
    
    // Message author reminder
    return message.reply({ content: `Please use the dropdown menu in the ticket panel or click the interaction to fill details for **${type.toUpperCase()}**!` });
  }
});

// Interaction handler (Select Menu, Modals, Buttons)
client.on('interactionCreate', async (interaction) => {
  try {
    // 1. Dropdown Select Menu
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
      const selectedType = interaction.values[0]; // 'i2c', 'c2i', 'c2c'

      const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${selectedType}`)
        .setTitle(`Create ${selectedType.toUpperCase()} Ticket`);

      const sendMethodInput = new TextInputBuilder()
        .setCustomId('sending_method')
        .setLabel('Sending Method')
        .setPlaceholder('e.g. Payment / PayPal / GiftCard')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const recvCryptoInput = new TextInputBuilder()
        .setCustomId('receiving_crypto')
        .setLabel('Receiving Crypto')
        .setPlaceholder('e.g. Usdt / LTC / BTC')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const dealAmountInput = new TextInputBuilder()
        .setCustomId('deal_amount')
        .setLabel('Deal Amount')
        .setPlaceholder('e.g. 10')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(sendMethodInput),
        new ActionRowBuilder().addComponents(recvCryptoInput),
        new ActionRowBuilder().addComponents(dealAmountInput)
      );

      await interaction.showModal(modal);
    }

    // 2. Modal Submission -> Create Ticket Channel
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
      const ticketType = interaction.customId.replace('ticket_modal_', '').toUpperCase();
      const sendingMethod = interaction.fields.getTextInputValue('sending_method');
      const receivingCrypto = interaction.fields.getTextInputValue('receiving_crypto');
      const dealAmount = interaction.fields.getTextInputValue('deal_amount');

      await interaction.deferReply({ ephemeral: true });

      dealCounter++;
      const currentDealId = dealCounter;
      const cleanUsername = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const channelName = `ticket-${cleanUsername}-${currentDealId}`;

      const guild = interaction.guild;
      if (!guild) return;

      // Create ticket channel
      const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: CATEGORY_ID || null,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id, // Ticket opener
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          },
          {
            id: EXCHANGER_ROLE_ID, // Staff role
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          }
        ]
      });

      // Ticket embed
      const ticketEmbed = new EmbedBuilder()
        .setTitle('Welcome to Cozy Exchange Ticket')
        .setDescription(
          `Hello ${interaction.user}, thank you for creating a ticket!\n` +
          `<@&${EXCHANGER_ROLE_ID}> staff will be with you shortly.\n\n` +
          `**Deal ID:** ${currentDealId}\n` +
          `**Category:** ${ticketType}\n\n` +
          `**Deal Information**\n` +
          `• **Sending Method:** ${sendingMethod}\n` +
          `• **Receiving Crypto:** ${receivingCrypto}\n` +
          `• **Deal Amount:** ${dealAmount}`
        )
        .setColor(0x2b2d31);

      // Buttons
      const claimBtn = new ButtonBuilder()
        .setCustomId(`ticket_claim_${currentDealId}`)
        .setLabel('Claim Ticket')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🟢');

      const unclaimBtn = new ButtonBuilder()
        .setCustomId(`ticket_unclaim_${currentDealId}`)
        .setLabel('Unclaim Ticket')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🟢');

      const closeBtn = new ButtonBuilder()
        .setCustomId(`ticket_close_${currentDealId}`)
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🚫');

      const mmBtn = new ButtonBuilder()
        .setCustomId(`ticket_req_mm_${currentDealId}`)
        .setLabel('Request Middleman')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👨‍💼');

      const row1 = new ActionRowBuilder().addComponents(unclaimBtn, closeBtn);
      const row2 = new ActionRowBuilder().addComponents(mmBtn);

      await ticketChannel.send({
        content: `${interaction.user} <@&${EXCHANGER_ROLE_ID}>`,
        embeds: [ticketEmbed],
        components: [row1, row2]
      });

      await interaction.editReply({
        content: `<a:rizz_tick:1531330187160064030> Ticket created! Check your channel: ${ticketChannel}`
      });
    }

    // 3. Ticket Button Interactions
    else if (interaction.isButton()) {
      if (interaction.customId.startsWith('ticket_claim_')) {
        const isStaff = await isStaffMember(interaction.member || interaction.user, interaction.guild);

        if (!isStaff) {
          const errEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this button!**`);
          await interaction.reply({ embeds: [errEmbed], ephemeral: true });
          return;
        }

        const channel = interaction.channel;
        const newChannelName = channel.name.replace(/^ticket-/, 'claimed-');
        await channel.setName(newChannelName).catch(() => {});

        const claimEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setDescription(`<a:rizz_tick:1531330187160064030> **Ticket Claimed!**\n\nThis ticket is now being handled by ${interaction.user}.`);

        await interaction.reply({ embeds: [claimEmbed] });
      } else if (interaction.customId.startsWith('ticket_req_mm_')) {
        const isStaff = await isStaffMember(interaction.member || interaction.user, interaction.guild);

        if (!isStaff) {
          const errEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this button!**`);
          await interaction.reply({ embeds: [errEmbed], ephemeral: true });
          return;
        }

        await interaction.reply({
          content: `<a:rizz_tick:1531330187160064030> **Middleman Requested!** Pinged <@&${EXCHANGER_ROLE_ID}>.`
        });
      } else if (interaction.customId.startsWith('ticket_unclaim_')) {
        const isStaff = await isStaffMember(interaction.member || interaction.user, interaction.guild);

        if (!isStaff) {
          const errEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this button!**`);
          await interaction.reply({ embeds: [errEmbed], ephemeral: true });
          return;
        }

        const channel = interaction.channel;
        const newChannelName = channel.name.replace(/^claimed-/, 'ticket-');
        await channel.setName(newChannelName).catch(() => {});

        const unclaimEmbed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setDescription(`🟡 **Ticket Unclaimed!**\n\n${interaction.user} has unclaimed this ticket. It is now open for other staff.`);

        await interaction.reply({ embeds: [unclaimEmbed] });
      } else if (interaction.customId.startsWith('ticket_close_')) {
        const isStaff = await isStaffMember(interaction.member || interaction.user, interaction.guild);

        if (!isStaff) {
          const errEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this button!**`);
          await interaction.reply({ embeds: [errEmbed], ephemeral: true });
          return;
        }

        const closeEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('🔒 Ticket Closing')
          .setDescription(`Ticket closed by ${interaction.user}. Channel will be deleted in 5 seconds...`);

        await interaction.reply({ embeds: [closeEmbed] });

        setTimeout(async () => {
          try {
            await interaction.channel.delete();
          } catch (e) {
            console.error('Error deleting channel:', e);
          }
        }, 5000);
      }
    }
  } catch (error) {
    console.error('Interaction handler error:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true }).catch(() => {});
    }
  }
});

// Start Discord Bot with Token from Environment Variable
let rawToken = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN || '';
const BOT_TOKEN = rawToken.trim().replace(/^["']|["']$/g, '');

if (!BOT_TOKEN) {
  console.error('[ERROR] Discord bot token is missing! Please set DISCORD_BOT_TOKEN in your environment variables.');
} else {
  client.login(BOT_TOKEN).catch(err => {
    console.error('[LOGIN ERROR] Failed to log in with provided DISCORD_BOT_TOKEN:', err);
  });
          }
