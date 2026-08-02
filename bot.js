const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, 
  ChannelType, 
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

// Temporary state variables
let currentRate = '1 USDT = 135 INR';
let totalExchangedVolume = 50000; // in USD or INR as configured
let totalDealsCount = 124;

client.once('ready', () => {
  console.log(`[BOT READY] Logged in as ${client.user.tag}!`);
  
  // Set custom status
  client.user.setPresence({
    activities: [{
      name: 'Cozy Exchange Deals | !panel',
      type: ActivityType.Watching
    }],
    status: 'online'
  });
});

// Helper function to build the ticket panel components
function createTicketPanelComponents() {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('Click to exchange...')
    .addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('INR TO CRYPTO (I2C)')
        .setValue('cat_i2c')
        .setDescription('Exchange INR (UPI/Bank) to Cryptocurrency')
        .setEmoji('1531330187160064030'),
      new StringSelectMenuOptionBuilder()
        .setLabel('CRYPTO TO INR (C2I)')
        .setValue('cat_c2i')
        .setDescription('Exchange Cryptocurrency to INR (UPI/Bank)')
        .setEmoji('1531330187160064030'),
      new StringSelectMenuOptionBuilder()
        .setLabel('CRYPTO TO CRYPTO (C2C)')
        .setValue('cat_c2c')
        .setDescription('Exchange between different Cryptocurrencies')
        .setEmoji('1531330187160064030')
    ]);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor(0x00ffaa)
    .setTitle('<a:rizz_tick:1531330187160064030> Cozy Exchange | Ticket System')
    .setDescription(
      `Welcome to **Cozy Exchange**! Please select the exchange type below to create a ticket.\n\n` +
      `**Available Exchange Categories:**\n` +
      `<a:rizz_tick:1531330187160064030> **INR to Crypto (I2C)**\n` +
      `<a:rizz_tick:1531330187160064030> **Crypto to INR (C2I)**\n` +
      `<a:rizz_tick:1531330187160064030> **Crypto to Crypto (C2C)**\n\n` +
      `📌 **Note:** Make sure to read <#${RULES_CHANNEL_ID}> before proceeding with any deal!`
    )
    .addFields(
      { name: '📊 Live Exchange Rate', value: `\`${currentRate}\``, inline: true },
      { name: '🌐 Total Volume', value: `\`$${totalExchangedVolume.toLocaleString()}\``, inline: true },
      { name: '🤝 Total Deals Completed', value: `\`${totalDealsCount}\``, inline: true }
    )
    .setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png')
    .setFooter({ text: 'Cozy Exchange • Fast, Secure & Reliable', iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
    .setTimestamp();

  return { embeds: [embed], components: [row] };
}

// Handle Prefix Commands (!panel, .panel, !rate, .done, etc.)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  const args = content.split(/\s+/);
  const command = args[0].toLowerCase();
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

    const panelData = createTicketPanelComponents();
    await message.channel.send(panelData);
    if (message.deletable) message.delete().catch(() => {});
    return;
  }

  // Command: !claim, .claim
  if (['!claim', '.claim'].includes(command)) {
    if (!message.channel.name.endsWith('-ticket') && !message.channel.name.startsWith('claimed-') && !message.channel.name.startsWith('ticket-')) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside exchange ticket channels!**');
      return message.reply({ embeds: [errEmbed] });
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      return message.reply({ embeds: [errEmbed] });
    }

    const claimer = message.author;
    let oldName = message.channel.name;
    let newName = oldName.replace(/^(ticket|claimed)-/, `claimed-${claimer.username.toLowerCase()}-`);
    if (newName.length > 100) newName = newName.substring(0, 100);

    await message.channel.setName(newName).catch(() => {});

    const claimEmbed = new EmbedBuilder()
      .setColor(0x00ffaa)
      .setTitle('<a:rizz_tick:1531330187160064030> Ticket Claimed!')
      .setDescription(`This ticket has been claimed by ${claimer}. They will handle your exchange deal.`)
      .setTimestamp();

    return message.reply({ embeds: [claimEmbed] });
  }

  // Command: !unclaim, .unclaim
  if (['!unclaim', '.unclaim'].includes(command)) {
    if (!message.channel.name.endsWith('-ticket') && !message.channel.name.startsWith('claimed-') && !message.channel.name.startsWith('ticket-')) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside exchange ticket channels!**');
      return message.reply({ embeds: [errEmbed] });
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      return message.reply({ embeds: [errEmbed] });
    }

    let oldName = message.channel.name;
    let newName = oldName.replace(/^claimed-[^-]+-/, 'ticket-');
    await message.channel.setName(newName).catch(() => {});

    const unclaimEmbed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle('ℹ️ Ticket Unclaimed')
      .setDescription(`This ticket was unclaimed by ${message.author}. Another staff member will assist you shortly.`)
      .setTimestamp();

    return message.reply({ embeds: [unclaimEmbed] });
  }

  // Command: !close, .close
  if (['!close', '.close'].includes(command)) {
    if (!message.channel.name.endsWith('-ticket') && !message.channel.name.startsWith('claimed-') && !message.channel.name.startsWith('ticket-')) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside exchange ticket channels!**');
      return message.reply({ embeds: [errEmbed] });
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      return message.reply({ embeds: [errEmbed] });
    }

    const closingEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('🔒 Closing Ticket...')
      .setDescription('Generating transcript and closing channel in 5 seconds...');

    await message.reply({ embeds: [closingEmbed] });

    setTimeout(async () => {
      try {
        // Generate simple transcript text
        const fetchedMessages = await message.channel.messages.fetch({ limit: 100 });
        const transcriptText = fetchedMessages
          .reverse()
          .map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.cleanContent}`)
          .join('\n');

        const transcriptChannel = message.guild.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
        if (transcriptChannel) {
          const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), { name: `${message.channel.name}-transcript.txt` });
          const transEmbed = new EmbedBuilder()
            .setColor(0x00ffaa)
            .setTitle(`📜 Transcript Log - ${message.channel.name}`)
            .addFields(
              { name: 'Closed By', value: message.author.tag, inline: true },
              { name: 'Channel', value: message.channel.name, inline: true }
            )
            .setTimestamp();

          await transcriptChannel.send({ embeds: [transEmbed], files: [attachment] });
        }

        await message.channel.delete().catch(() => {});
      } catch (e) {
        console.error('Error closing ticket:', e);
      }
    }, 5000);
    return;
  }

  // Command: !setrate, .setrate
  if (['!setrate', '.setrate'].includes(command)) {
    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      return message.reply({ embeds: [errEmbed] });
    }

    const newRate = args.slice(1).join(' ');
    if (!newRate) {
      return message.reply('❌ Usage: `.setrate 1 USDT = 135 INR`');
    }

    currentRate = newRate;
    const okEmbed = new EmbedBuilder()
      .setColor(0x00ffaa)
      .setDescription(`<a:rizz_tick:1531330187160064030> **Updated Exchange Rate to:** \`${currentRate}\``);
    return message.reply({ embeds: [okEmbed] });
  }

  // Command: .done, .dn, .c, .u (Deal Completion shortcuts)
  if (['.done', '.dn', '.c', '.u', '!done', '!dn', '!c', '!u'].includes(command)) {
    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      return message.reply({ embeds: [errEmbed] });
    }

    // Format: .done @User <Amount> <Method> OR .c <Amount> <Method>
    const targetUser = message.mentions.users.first() || message.author;
    const cleanArgs = args.filter(a => !a.startsWith('<@'));

    const dealAmount = cleanArgs[1] || '100';
    const dealType = cleanArgs[2] || 'Crypto/INR';

    totalDealsCount += 1;
    const parsedAmount = parseFloat(dealAmount.replace(/[^0-9.]/g, '')) || 0;
    totalExchangedVolume += parsedAmount;

    // Send Deal Confirmation in ticket channel
    const doneEmbed = new EmbedBuilder()
      .setColor(0x00ffaa)
      .setTitle('<a:rizz_tick:1531330187160064030> Deal Marked as Completed!')
      .setDescription(
        `**Deal Summary:**\n` +
        `• **User:** ${targetUser}\n` +
        `• **Exchanger:** ${message.author}\n` +
        `• **Amount:** \`${dealAmount}\`\n` +
        `• **Method:** \`${dealType}\`\n\n` +
        `Thank you for exchanging with **Cozy Exchange**! Please vouch for us if you enjoyed our service.`
      )
      .setTimestamp();

    await message.reply({ embeds: [doneEmbed] });

    // Send record to HISTORY_CHANNEL
    const historyChannel = message.guild.channels.cache.get(HISTORY_CHANNEL_ID);
    if (historyChannel) {
      const histEmbed = new EmbedBuilder()
        .setColor(0x00ffaa)
        .setTitle('<a:rizz_tick:1531330187160064030> New Successful Exchange Deal!')
        .addFields(
          { name: 'Customer', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
          { name: 'Handled By', value: `${message.author.tag}`, inline: true },
          { name: 'Amount', value: `\`${dealAmount}\``, inline: true },
          { name: 'Exchange Method', value: `\`${dealType}\``, inline: true },
          { name: 'Total Server Deals', value: `\`#${totalDealsCount}\``, inline: true }
        )
        .setFooter({ text: 'Cozy Exchange History Tracker' })
        .setTimestamp();

      await historyChannel.send({ embeds: [histEmbed] });
    }
    return;
  }
});

// Handle Select Menus and Buttons
client.on('interactionCreate', async (interaction) => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_category_select') {
      const selectedCat = interaction.values[0];

      let catName = 'Exchange';
      let catPrefix = 'ticket';
      if (selectedCat === 'cat_i2c') { catName = 'I2C (INR to Crypto)'; catPrefix = 'i2c'; }
      if (selectedCat === 'cat_c2i') { catName = 'C2I (Crypto to INR)'; catPrefix = 'c2i'; }
      if (selectedCat === 'cat_c2c') { catName = 'C2C (Crypto to Crypto)'; catPrefix = 'c2c'; }

      // Ask user modal-like prompt or direct creation with default details
      // Show confirmation / information collector message as ephemeral or direct channel creation
      await interaction.reply({
        content: `<a:rizz_tick:1531330187160064030> Creating your **${catName}** exchange ticket...`,
        ephemeral: true
      });

      const randomId = Math.floor(1000 + Math.random() * 9000);
      const channelName = `${catPrefix}-${interaction.user.username}-${randomId}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

      try {
        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: interaction.guild.id, // @everyone
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
              id: EXCHANGER_ROLE_ID, // Exchanger Role
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
              ]
            }
          ]
        });

        // Create buttons inside ticket
        const claimBtn = new ButtonBuilder()
          .setCustomId(`ticket_claim_${interaction.user.id}`)
          .setLabel('Claim Ticket')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🙋‍♂️');

        const unclaimBtn = new ButtonBuilder()
          .setCustomId(`ticket_unclaim_${interaction.user.id}`)
          .setLabel('Unclaim Ticket')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🟢');

        const closeBtn = new ButtonBuilder()
          .setCustomId(`ticket_close_${interaction.user.id}`)
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🚫');

        const mmBtn = new ButtonBuilder()
          .setCustomId(`ticket_req_mm_${interaction.user.id}`)
          .setLabel('Request Middleman')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('👔');

        const btnRow = new ActionRowBuilder().addComponents(claimBtn, unclaimBtn, closeBtn, mmBtn);

        const welcomeEmbed = new EmbedBuilder()
          .setColor(0x00ffaa)
          .setTitle('Welcome to Cozy Exchange Ticket')
          .setDescription(
            `Hello ${interaction.user}, thank you for creating a ticket!\n` +
            `<@&${EXCHANGER_ROLE_ID}> staff will be with you shortly.\n\n` +
            `**Deal ID:** \`${randomId}\`\n` +
            `**Category:** \`${catPrefix.toUpperCase()}\`\n\n` +
            `**Deal Information**\n` +
            `• **Sending Method:** Payment\n` +
            `• **Receiving Crypto:** Usdt\n` +
            `• **Deal Amount:** 1`
          )
          .setFooter({ text: 'Cozy Exchange • Fast & Secure' })
          .setTimestamp();

        await ticketChannel.send({
          content: `${interaction.user} <@&${EXCHANGER_ROLE_ID}>`,
          embeds: [welcomeEmbed],
          components: [btnRow]
        });

        await interaction.followUp({
          content: `<a:rizz_tick:1531330187160064030> Your exchange ticket has been opened: ${ticketChannel}`,
          ephemeral: true
        });

      } catch (err) {
        console.error('Failed to create ticket channel:', err);
        await interaction.followUp({
          content: '❌ Failed to create ticket channel. Please check bot permissions!',
          ephemeral: true
        });
      }
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('ticket_claim_')) {
      const isStaff = await isStaffMember(interaction.member || interaction.user, interaction.guild);

      if (!isStaff) {
        const errEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this button!**`);
        await interaction.reply({ embeds: [errEmbed], ephemeral: true });
        return;
      }

      const claimer = interaction.user;
      let oldName = interaction.channel.name;
      let newName = oldName.replace(/^(ticket|claimed|[a-z0-9]+)-/, `claimed-${claimer.username.toLowerCase()}-`);
      if (newName.length > 100) newName = newName.substring(0, 100);

      await interaction.channel.setName(newName).catch(() => {});

      const claimEmbed = new EmbedBuilder()
        .setColor(0x00ffaa)
        .setTitle('<a:rizz_tick:1531330187160064030> Ticket Claimed!')
        .setDescription(`This ticket was claimed by ${claimer}. They will process your exchange deal.`)
        .setTimestamp();

      await interaction.reply({ embeds: [claimEmbed] });
    } else if (interaction.customId.startsWith('ticket_unclaim_')) {
      const isStaff = await isStaffMember(interaction.member || interaction.user, interaction.guild);

      if (!isStaff) {
        const errEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this button!**`);
        await interaction.reply({ embeds: [errEmbed], ephemeral: true });
        return;
      }

      let oldName = interaction.channel.name;
      let newName = oldName.replace(/^claimed-[^-]+-/, 'ticket-');
      await interaction.channel.setName(newName).catch(() => {});

      const unclaimEmbed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle('ℹ️ Ticket Unclaimed')
        .setDescription(`This ticket was unclaimed by ${interaction.user}. Another staff member will assist you shortly.`)
        .setTimestamp();

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

      const closingEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🔒 Closing Ticket...')
        .setDescription('Generating transcript and closing channel in 5 seconds...');

      await interaction.reply({ embeds: [closingEmbed] });

      setTimeout(async () => {
        try {
          const fetchedMessages = await interaction.channel.messages.fetch({ limit: 100 });
          const transcriptText = fetchedMessages
            .reverse()
            .map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.cleanContent}`)
            .join('\n');

          const transcriptChannel = interaction.guild.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
          if (transcriptChannel) {
            const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), { name: `${interaction.channel.name}-transcript.txt` });
            const transEmbed = new EmbedBuilder()
              .setColor(0x00ffaa)
              .setTitle(`📜 Transcript Log - ${interaction.channel.name}`)
              .addFields(
                { name: 'Closed By', value: interaction.user.tag, inline: true },
                { name: 'Channel', value: interaction.channel.name, inline: true }
              )
              .setTimestamp();

            await transcriptChannel.send({ embeds: [transEmbed], files: [attachment] });
          }

          await interaction.channel.delete().catch(() => {});
        } catch (e) {
          console.error('Error closing ticket via button:', e);
        }
      }, 5000);
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
    }
  }
});

// Start Discord Bot with Token from Environment Variable
let rawToken = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN || '';
const BOT_TOKEN = rawToken.trim().replace(/^["']|["']$/g, '');

if (!BOT_TOKEN) {
  console.warn('[WARNING] No DISCORD_BOT_TOKEN or BOT_TOKEN variable set in environment! Add your token in process.env or settings.');
} else {
  client.login(BOT_TOKEN).catch(err => {
    console.error('[LOGIN ERROR] Failed to log into Discord:', err.message);
  });
}
