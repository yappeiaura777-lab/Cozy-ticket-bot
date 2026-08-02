// Standalone Discord.js Exchange Bot (Cozy Exchange Panel & Ticket System)
// Ready for 24/7 hosting on Render, Replit, Railway, Discloud, or VPS.

try { require('dotenv').config(); } catch (e) {}

const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ButtonBuilder, 
  ButtonStyle, 
  PermissionFlagsBits, 
  ActivityType, 
  AttachmentBuilder 
} = require('discord.js');

// Global error handlers to prevent crash on unexpected rejections
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

// Roles & Config Constants
const EXCHANGER_ROLE_ID = '1532005989879124129';

// Helper to reliably check if a member has the required staff role (<@&1532005989879124129>) or admin perms
async function isStaffMember(memberOrUser, guild) {
  if (!memberOrUser) return false;
  let member = memberOrUser;
  
  // Fetch full GuildMember if given a User or raw object
  if (guild && (!member.roles || !('cache' in member.roles))) {
    member = await guild.members.fetch(memberOrUser.id || memberOrUser).catch(() => null);
  }
  if (!member || !member.roles) return false;

  const hasRole = member.roles.cache 
    ? member.roles.cache.has(EXCHANGER_ROLE_ID) 
    : (Array.isArray(member.roles) ? member.roles.includes(EXCHANGER_ROLE_ID) : false);
  const isAdmin = member.permissions?.has 
    ? (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) 
    : false;

  return hasRole || isAdmin;
}

const TRANSCRIPT_CHANNEL_ID = '1531286414757593178';
const HISTORY_CHANNEL_ID = '1531286413289656411';
const RULES_CHANNEL_ID = '1531286418025091171';
const FEEDBACK_CHANNEL_ID = '1532423288058417182';

// In-Memory Storage
const ticketDataMap = new Map();
const tempExchangeMap = new Map();

// Default Exchange Rates Configuration
const rates = {
  inrToCrypto: 104,
  cryptoToInrBelow100: 100,
  cryptoToInrAbove100: 101,
  cryptoToCryptoFeePercent: 1.5,
  minAmountDollars: 1,
  categoryIds: {
    i2c: '1531286400882966589',
    c2i: '1531286401889599612',
    c2c: '1531286403734835381'
  }
};

// Helper: Check if a channel is a valid exchange ticket channel
function isTicketChannel(channel) {
  if (!channel || !channel.name) return false;

  if (ticketDataMap.has(channel.id)) return true;
  for (const [id, t] of ticketDataMap.entries()) {
    if (t.channelId === channel.id || (id && channel.name.includes(id))) {
      return true;
    }
  }

  if (channel.parentId && Object.values(rates.categoryIds).includes(channel.parentId)) {
    return true;
  }

  const name = channel.name.toLowerCase();
  if (/^(i2c|c2i|c2c|ticket|deal|claimed|unclaimed|claim|done)-/.test(name)) {
    return true;
  }

  return false;
}

// Helper: Get ticket data safely from channel
function getTicketData(channel) {
  if (!channel) return null;
  if (ticketDataMap.has(channel.id)) return ticketDataMap.get(channel.id);
  const name = channel.name || '';
  for (const [id, t] of ticketDataMap.entries()) {
    if (t.channelId === channel.id || (id && name.includes(id))) {
      return t;
    }
  }
  return null;
}

client.on('ready', () => {
  console.log(`[Cozy Bot] Logged in as ${client.user.tag}!`);
  client.user.setPresence({
    activities: [{ name: 'Cozy Exchange Panel', type: ActivityType.Watching }],
    status: 'online'
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();
  const lowerContent = content.toLowerCase();

  // Command: !panel, .panel, !setup, .setup
  if (['!panel', '.panel', '!setup', '.setup'].includes(lowerContent)) {
    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only staff members with <@&${EXCHANGER_ROLE_ID}> role can run the panel setup command!**`);
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setDescription(
        `# Cozy Exchange Panel\n\n` +
        `Exchange Rates : <a:paisafire:1531292252498956513>\n\n` +
        `<:paisa:1531292193829028042> **INR TO CRYPTO**\n` +
        `<a:Arroww:1531292687188234441> Any Amount ${rates.inrToCrypto}/$\n\n` +
        `<:cryptos:1531293118580658286> **CRYPTO TO INR**\n` +
        `<a:Arroww:1531292687188234441> Below 100$ : ${rates.cryptoToInrBelow100}/$\n` +
        `<a:Arroww:1531292687188234441> Above 100$ : ${rates.cryptoToInrAbove100}/$\n\n` +
        `<a:c2c_exchs:1531292173230673980> **CRYPTO TO CRYPTO**\n` +
        `<a:Arroww:1531292687188234441> ${rates.cryptoToCryptoFeePercent}% + Transaction Fees\n\n` +
        `<a:rules_books:1531292929086460034> **RULES**\n` +
        `<:bluebutton:1531292103882047640> Read Our <#${RULES_CHANNEL_ID}> Before proceeding\n` +
        `<:bluebutton:1531292103882047640> Fixed Rates No Negotiation\n` +
        `<:bluebutton:1531292103882047640> Minimum **${rates.minAmountDollars}$**\n` +
        `<:bluebutton:1531292103882047640> Don't Ping Staff in ticket`
      )
      .setFooter({ text: 'Cozy Exch & MM' });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_exchange_type')
      .setPlaceholder('Select exchange type')
      .addOptions([
        { label: 'INR TO CRYPTO', value: 'i2c', emoji: { id: '1531292193829028042' } },
        { label: 'CRYPTO TO INR', value: 'c2i', emoji: { id: '1531293118580658286' } },
        { label: 'CRYPTO TO CRYPTO', value: 'c2c', emoji: { id: '1531292173230673980' } }
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }

  // Command: .vouch, !vouch
  if (lowerContent.startsWith('.vouch') || lowerContent.startsWith('!vouch')) {
    if (!isTicketChannel(message.channel)) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside an active ticket channel!**');
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const data = getTicketData(message.channel);
    const ticketOwner = data?.user ? `<@${data.user.id}>` : `<@${message.author.id}>`;
    const exchangerUser = data?.claimedUser ? `<@${data.claimedUser.id}>` : '@staff';
    const typeStr = data?.type === 'c2i' ? 'CRYPTO TO INR' : data?.type === 'c2c' ? 'CRYPTO TO CRYPTO' : 'INR TO CRYPTO';

    let usdVal = 1.00;
    if (data?.modalData?.dealAmount) {
      const amtStr = String(data.modalData.dealAmount);
      const raw = parseFloat(amtStr.replace(/[^0-9.]/g, ''));
      if (!isNaN(raw) && raw > 0) {
        if (data.type === 'i2c') {
          usdVal = amtStr.includes('$') ? raw : (raw / 104);
        } else {
          usdVal = raw;
        }
      }
    }
    const amountUsdStr = `${usdVal.toFixed(2)}$`;
    const copyableText = `+rep ${exchangerUser} EXCHANGED ${typeStr} [${amountUsdStr}]`;

    const vouchEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setThumbnail('https://cdn.discordapp.com/attachments/1531294400657887322/1532019340709466293')
      .setDescription(
        `<a:green_button:1531292779999662181> **Vouch**\n\n` +
        `<a:rizz_tick:1531330187160064030> ${ticketOwner} Your deal has been completed successfully!\n\n` +
        `\`your Vouch ${copyableText}\`\n\n` +
        `📖 Ticket log & exchange history have been saved!`
      );

    const copyBtnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`copy_vouch_${data?.id || 'default'}`)
        .setLabel('Copy Vouch')
        .setEmoji('1531292779999662181')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`feedback_btn_${data?.id || 'default'}`)
        .setLabel('Give Feedback')
        .setEmoji('⭐')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [vouchEmbed], components: [copyBtnRow] });
    return;
  }

  // Command: .c or !c -> CLAIM TICKET
  if (['.c', '!c'].includes(lowerContent)) {
    if (!isTicketChannel(message.channel)) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside an active ticket channel!**');
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const data = getTicketData(message.channel);
    if (data) {
      data.claimedUser = message.author;
    }

    const authorClean = message.author.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
    const newChanName = `claimed-${authorClean}-${data?.id || Math.floor(1000 + Math.random() * 9000)}`;
    if (message.channel && 'setName' in message.channel) {
      message.channel.setName(newChanName).catch(() => {});
    }

    const claimEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(
        `<a:green_button:1531292779999662181> **Ticket Claimed!**\n\n` +
        `<:Exchangeru:1531340808446542056> **Claimed By:** <@${message.author.id}>\n` +
        `<a:Arroww:1531292687188234441> Staff is now reviewing your deal. Please wait for instructions.`
      );

    await message.channel.send({ embeds: [claimEmbed] });
    return;
  }

  // Command: .u or !u -> UNCLAIM TICKET
  if (['.u', '!u'].includes(lowerContent)) {
    if (!isTicketChannel(message.channel)) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside an active ticket channel!**');
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const data = getTicketData(message.channel);
    if (data) {
      data.claimedUser = null;
    }

    const newChanName = `unclaimed-${data?.id || Math.floor(1000 + Math.random() * 9000)}`;
    if (message.channel && 'setName' in message.channel) {
      message.channel.setName(newChanName).catch(() => {});
    }

    const unclaimEmbed = new EmbedBuilder()
      .setColor(0xffa500)
      .setDescription(
        `<a:red_button:1531292779999662181> **Ticket Unclaimed**\n\n` +
        `<:Exchangeru:1531340808446542056> Ticket has been unclaimed by <@${message.author.id}>.\n` +
        `<a:Arroww:1531292687188234441> The ticket is now available for other staff members to claim.`
      );

    await message.channel.send({ embeds: [unclaimEmbed] });
    return;
  }

  // Command: .dn, .done, !dn, !done -> MARK TICKET DONE
  if (['.dn', '!dn', '.done', '!done'].includes(lowerContent)) {
    if (!isTicketChannel(message.channel)) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside an active ticket channel!**');
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const doneEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(
        `<a:rizz_tick:1531330187160064030> **Ticket Completed / Done!**\n\n` +
        `<a:green_button:1531292779999662181> Deal marked as completed by <@${message.author.id}>.\n\n` +
        `<a:Arroww:1531292687188234441> Type \`.vouch\` to generate vouch message & review buttons, or \`.close\` to close and archive this ticket.`
      );

    await message.channel.send({ embeds: [doneEmbed] });
    return;
  }

  // Command: .close, !close -> CLOSE TICKET & SEND TRANSCRIPT/HISTORY
  if (['.close', '!close'].includes(lowerContent)) {
    if (!isTicketChannel(message.channel)) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription('❌ **This command can only be used inside an active ticket channel!**');
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const isStaff = await isStaffMember(message.member || message.author, message.guild);

    if (!isStaff) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this command!**`);
      const reply = await message.channel.send({ embeds: [errEmbed] });
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const data = getTicketData(message.channel);
    const closeEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(
        `<a:rizz_tick:1531330187160064030> **Closing Ticket...**\n\n` +
        `<a:green_button:1531292779999662181> Ticket close initiated by <@${message.author.id}>.\n\n` +
        `<a:Arroww:1531292687188234441> Generating transcript file & sending logs to DM & <#${TRANSCRIPT_CHANNEL_ID}>...\n` +
        `This channel will auto-delete in 5 seconds.`
      );

    await message.channel.send({ embeds: [closeEmbed] });
    await sendTranscript(data?.id || message.channel.id, message.author, message.channel);

    setTimeout(() => {
      if (message.channel && 'delete' in message.channel) {
        message.channel.delete().catch(() => {});
      }
    }, 5000);
    return;
  }
});

// Interactions Handler (Modals, Dropdowns, Buttons)
client.on('interactionCreate', async (interaction) => {
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_exchange_type') {
    const selected = interaction.values[0];

    if (selected === 'i2c') {
      const modal = new ModalBuilder().setCustomId('modal_i2c').setTitle('Initiate INR to Crypto Exchange');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('send_method').setLabel('Sending Method (e.g. UPI, GPay, Paytm)').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('rec_crypto').setLabel('Receiving Crypto (e.g. LTC, USDT, TRX)').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('deal_amount').setLabel(`Deal Amount (Min $${rates.minAmountDollars})`).setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
    } else if (selected === 'c2i') {
      const modal = new ModalBuilder().setCustomId('modal_c2i').setTitle('Initiate Crypto to INR Exchange');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('send_crypto').setLabel('Sending Crypto (e.g. LTC, USDT)').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('rec_inr').setLabel('Receiving INR Method (e.g. UPI, Bank)').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('deal_amount').setLabel(`Deal Amount (Min $${rates.minAmountDollars})`).setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
    } else if (selected === 'c2c') {
      const modal = new ModalBuilder().setCustomId('modal_c2c').setTitle('Initiate Crypto to Crypto Exchange');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('send_crypto').setLabel('Sending Crypto (e.g. BTC, LTC)').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('rec_crypto').setLabel('Receiving Crypto (e.g. USDT)').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('deal_amount').setLabel(`Deal Amount (Min $${rates.minAmountDollars})`).setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
      await interaction.showModal(modal);
    }
  } else if (interaction.isModalSubmit()) {
    if (['modal_i2c', 'modal_c2i', 'modal_c2c'].includes(interaction.customId)) {
      await interaction.deferReply({ ephemeral: true });

      const dealId = Math.floor(1000 + Math.random() * 9000).toString();
      const user = interaction.user;
      let type = 'i2c';
      let catId = rates.categoryIds.i2c;
      let modalData = {};

      if (interaction.customId === 'modal_i2c') {
        type = 'i2c';
        catId = rates.categoryIds.i2c;
        modalData = {
          sendMethod: interaction.fields.getTextInputValue('send_method'),
          recCrypto: interaction.fields.getTextInputValue('rec_crypto'),
          dealAmount: interaction.fields.getTextInputValue('deal_amount')
        };
      } else if (interaction.customId === 'modal_c2i') {
        type = 'c2i';
        catId = rates.categoryIds.c2i;
        modalData = {
          sendCrypto: interaction.fields.getTextInputValue('send_crypto'),
          recInr: interaction.fields.getTextInputValue('rec_inr'),
          dealAmount: interaction.fields.getTextInputValue('deal_amount')
        };
      } else if (interaction.customId === 'modal_c2c') {
        type = 'c2c';
        catId = rates.categoryIds.c2c;
        modalData = {
          sendCrypto: interaction.fields.getTextInputValue('send_crypto'),
          recCrypto: interaction.fields.getTextInputValue('rec_crypto'),
          dealAmount: interaction.fields.getTextInputValue('deal_amount')
        };
      }

      tempExchangeMap.set(interaction.id, { dealId, user, type, catId, modalData });

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setDescription(
          `# Cozy Exchange Ticket Confirmation\n\n` +
          `**Deal ID:** \`${dealId}\`\n\n` +
          `Please confirm your transaction details before creating the ticket:`
        );

      let fieldsStr = '';
      if (type === 'i2c') {
        fieldsStr = `• **Sending Method:** ${modalData.sendMethod}\n• **Receiving Crypto:** ${modalData.recCrypto}\n• **Deal Amount:** ${modalData.dealAmount}`;
      } else if (type === 'c2i') {
        fieldsStr = `• **Sending Crypto:** ${modalData.sendCrypto}\n• **Receiving INR:** ${modalData.recInr}\n• **Deal Amount:** ${modalData.dealAmount}`;
      } else if (type === 'c2c') {
        fieldsStr = `• **Sending Crypto:** ${modalData.sendCrypto}\n• **Receiving Crypto:** ${modalData.recCrypto}\n• **Deal Amount:** ${modalData.dealAmount}`;
      }

      confirmEmbed.addFields({ name: 'Details', value: fieldsStr });

      const confirmBtn = new ButtonBuilder()
        .setCustomId(`confirm_create_ticket_${interaction.id}`)
        .setLabel('Create Ticket')
        .setEmoji('1531292779999662181')
        .setStyle(ButtonStyle.Success);

      const cancelBtn = new ButtonBuilder()
        .setCustomId(`cancel_ticket_${interaction.id}`)
        .setLabel('Cancel')
        .setEmoji('1531292779999662181')
        .setStyle(ButtonStyle.Danger);

      const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);
      await interaction.editReply({ embeds: [confirmEmbed], components: [row] });
    } else if (interaction.customId.startsWith('feedback_modal_')) {
      const rating = interaction.fields.getTextInputValue('rating_input');
      const reviewText = interaction.fields.getTextInputValue('review_input');

      await interaction.reply({
        content: '<a:rizz_tick:1531330187160064030> **Thank you for your feedback!**',
        ephemeral: true
      });

      const feedbackEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setDescription(
          `<a:green_button:1531292779999662181> **New Client Feedback**\n\n` +
          `<:bluee_sup:1531339328561610872> **User:** ${interaction.user} (\`${interaction.user.tag}\`)\n` +
          `⭐ **Rating:** **${rating}**\n` +
          `💬 **Review:** ${reviewText}\n\n` +
          `Thank you for trusting Cozy Exchange & MM!`
        )
        .setFooter({ text: 'Cozy Exchange & MM • Customer Review' })
        .setTimestamp();

      try {
        const fbChannel = await client.channels.fetch(FEEDBACK_CHANNEL_ID).catch(() => null);
        if (fbChannel && 'send' in fbChannel) {
          await fbChannel.send({ embeds: [feedbackEmbed] }).catch(() => {});
        }
      } catch (e) {}
    }
  } else if (interaction.isButton()) {
    if (interaction.customId.startsWith('confirm_create_ticket_')) {
      const tempId = interaction.customId.replace('confirm_create_ticket_', '');
      const data = tempExchangeMap.get(tempId);

      if (!data) {
        await interaction.reply({ content: '❌ Session expired. Please fill out the form again.', ephemeral: true });
        return;
      }

      await interaction.deferUpdate();

      const guild = interaction.guild;
      const typePrefix = data.type;
      const channelName = `${typePrefix}-${data.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)}-${data.dealId}`;

      try {
        const ticketChannel = await guild.channels.create({
          name: channelName,
          parent: data.catId,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: data.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
            },
            {
              id: EXCHANGER_ROLE_ID,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
            }
          ]
        });

        ticketDataMap.set(data.dealId, {
          id: data.dealId,
          channelId: ticketChannel.id,
          user: data.user,
          type: data.type,
          modalData: data.modalData,
          claimedUser: null
        });

        ticketDataMap.set(ticketChannel.id, ticketDataMap.get(data.dealId));

        const ticketEmbed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setDescription(
            `# Welcome to Cozy Exchange Ticket\n\n` +
            `Hello ${data.user}, thank you for creating a ticket!\n` +
            `<@&${EXCHANGER_ROLE_ID}> staff will be with you shortly.\n\n` +
            `**Deal ID:** \`${data.dealId}\`\n` +
            `**Category:** ${data.type.toUpperCase()}`
          );

        let fieldsStr = '';
        if (data.type === 'i2c') {
          fieldsStr = `• **Sending Method:** ${data.modalData.sendMethod}\n• **Receiving Crypto:** ${data.modalData.recCrypto}\n• **Deal Amount:** ${data.modalData.dealAmount}`;
        } else if (data.type === 'c2i') {
          fieldsStr = `• **Sending Crypto:** ${data.modalData.sendCrypto}\n• **Receiving INR:** ${data.modalData.recInr}\n• **Deal Amount:** ${data.modalData.dealAmount}`;
        } else if (data.type === 'c2c') {
          fieldsStr = `• **Sending Crypto:** ${data.modalData.sendCrypto}\n• **Receiving Crypto:** ${data.modalData.recCrypto}\n• **Deal Amount:** ${data.modalData.dealAmount}`;
        }

        ticketEmbed.addFields({ name: 'Deal Information', value: fieldsStr });

        const claimBtn = new ButtonBuilder()
          .setCustomId(`ticket_claim_${data.dealId}`)
          .setLabel('Claim Ticket')
          .setEmoji('1531294162178277416')
          .setStyle(ButtonStyle.Success);

        const closeBtn = new ButtonBuilder()
          .setCustomId(`ticket_close_${data.dealId}`)
          .setLabel('Close Ticket')
          .setEmoji('1531978320986636293')
          .setStyle(ButtonStyle.Danger);

        const reqMmBtn = new ButtonBuilder()
          .setCustomId(`ticket_req_mm_${data.dealId}`)
          .setLabel('Request Middleman')
          .setEmoji('1531292984132239535')
          .setStyle(ButtonStyle.Primary);

        const ticketRow = new ActionRowBuilder().addComponents(claimBtn, closeBtn, reqMmBtn);

        await ticketChannel.send({ content: `<@${data.user.id}> <@&${EXCHANGER_ROLE_ID}>`, embeds: [ticketEmbed], components: [ticketRow] });

        await interaction.editReply({
          content: `<a:rizz_tick:1531330187160064030> **Ticket Created Successfully!** Check your new channel: ${ticketChannel}`,
          embeds: [],
          components: []
        });

      } catch (err) {
        console.error('Error creating ticket channel:', err);
        await interaction.editReply({
          content: `❌ **Failed to create ticket channel:** ${err.message}`,
          embeds: [],
          components: []
        });
      }

      tempExchangeMap.delete(tempId);
    } else if (interaction.customId.startsWith('cancel_ticket_')) {
      const tempId = interaction.customId.replace('cancel_ticket_', '');
      tempExchangeMap.delete(tempId);
      await interaction.update({
        content: '❌ **Ticket creation cancelled.**',
        embeds: [],
        components: []
      });
    } else if (interaction.customId.startsWith('copy_vouch_')) {
      const ticketId = interaction.customId.replace('copy_vouch_', '');
      const data = ticketDataMap.get(ticketId) || getTicketData(interaction.channel);

      const exchangerUser = data?.claimedUser ? `<@${data.claimedUser.id}>` : '@staff';
      const typeStr = data?.type === 'c2i' ? 'CRYPTO TO INR' : data?.type === 'c2c' ? 'CRYPTO TO CRYPTO' : 'INR TO CRYPTO';

      let usdVal = 1.00;
      if (data?.modalData?.dealAmount) {
        const amtStr = String(data.modalData.dealAmount);
        const raw = parseFloat(amtStr.replace(/[^0-9.]/g, ''));
        if (!isNaN(raw) && raw > 0) {
          if (data.type === 'i2c') {
            usdVal = amtStr.includes('$') ? raw : (raw / 104);
          } else {
            usdVal = raw;
          }
        }
      }
      const copyableText = `+rep ${exchangerUser} EXCHANGED ${typeStr} [${usdVal.toFixed(2)}$]`;

      await interaction.reply({
        content: `\`\`\`\n${copyableText}\n\`\`\``,
        ephemeral: true
      });
    } else if (interaction.customId.startsWith('feedback_btn_')) {
      const modal = new ModalBuilder()
        .setCustomId(`feedback_modal_${interaction.customId.replace('feedback_btn_', '')}`)
        .setTitle('Give Service Feedback');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('rating_input')
            .setLabel('Rating (1 to 5 Stars)')
            .setPlaceholder('e.g. ⭐⭐⭐⭐⭐ (5/5)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('review_input')
            .setLabel('Your Review / Feedback')
            .setPlaceholder('Describe your exchange experience with us...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
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
    } else if (interaction.customId.startsWith('ticket_claim_')) {
      const isStaff = await isStaffMember(interaction.member || interaction.user, interaction.guild);

      if (!isStaff) {
        const errEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(`❌ **Only members with <@&${EXCHANGER_ROLE_ID}> role can use this button!**`);
        await interaction.reply({ embeds: [errEmbed], ephemeral: true });
        return;
      }

      const ticketId = interaction.customId.replace('ticket_claim_', '');
      const data = ticketDataMap.get(ticketId) || getTicketData(interaction.channel);
      if (data) {
        data.claimedUser = interaction.user;
      }

      const authorClean = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
      const newChanName = `claimed-${authorClean}-${ticketId}`;
      if (interaction.channel && 'setName' in interaction.channel) {
        interaction.channel.setName(newChanName).catch(() => {});
      }

      const unclaimBtn = new ButtonBuilder()
        .setCustomId(`ticket_unclaim_${ticketId}`)
        .setLabel('Unclaim Ticket')
        .setEmoji('1531292779999662181')
        .setStyle(ButtonStyle.Secondary);

      const closeBtn = new ButtonBuilder()
        .setCustomId(`ticket_close_${ticketId}`)
        .setLabel('Close Ticket')
        .setEmoji('1531978320986636293')
        .setStyle(ButtonStyle.Danger);

      const reqMmBtn = new ButtonBuilder()
        .setCustomId(`ticket_req_mm_${ticketId}`)
        .setLabel('Request Middleman')
        .setEmoji('1531292984132239535')
        .setStyle(ButtonStyle.Primary);

      const updatedRow = new ActionRowBuilder().addComponents(unclaimBtn, closeBtn, reqMmBtn);

      try {
        await interaction.message.edit({ components: [updatedRow] }).catch(() => {});
      } catch (e) {}

      const claimEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setDescription(
          `<a:green_button:1531292779999662181> **Ticket Claimed!**\n\n` +
          `<:Exchangeru:1531340808446542056> **Claimed By:** <@${interaction.user.id}>\n` +
          `<a:Arroww:1531292687188234441> Staff is now reviewing your deal. Please wait for instructions.`
        );

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

      const ticketId = interaction.customId.replace('ticket_unclaim_', '');
      const data = ticketDataMap.get(ticketId) || getTicketData(interaction.channel);
      if (data) {
        data.claimedUser = null;
      }

      const newChanName = `unclaimed-${ticketId}`;
      if (interaction.channel && 'setName' in interaction.channel) {
        interaction.channel.setName(newChanName).catch(() => {});
      }

      const claimBtn = new ButtonBuilder()
        .setCustomId(`ticket_claim_${ticketId}`)
        .setLabel('Claim Ticket')
        .setEmoji('1531294162178277416')
        .setStyle(ButtonStyle.Success);

      const closeBtn = new ButtonBuilder()
        .setCustomId(`ticket_close_${ticketId}`)
        .setLabel('Close Ticket')
        .setEmoji('1531978320986636293')
        .setStyle(ButtonStyle.Danger);

      const reqMmBtn = new ButtonBuilder()
        .setCustomId(`ticket_req_mm_${ticketId}`)
        .setLabel('Request Middleman')
        .setEmoji('1531292984132239535')
        .setStyle(ButtonStyle.Primary);

      const restoredRow = new ActionRowBuilder().addComponents(claimBtn, closeBtn, reqMmBtn);

      try {
        await interaction.message.edit({ components: [restoredRow] }).catch(() => {});
      } catch (e) {}

      const unclaimEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setDescription(
          `<a:red_button:1531292779999662181> **Ticket Unclaimed**\n\n` +
          `Ticket has been unclaimed by <@${interaction.user.id}>. The ticket is now available for other staff members to claim.`
        );

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

      const ticketId = interaction.customId.replace('ticket_close_', '');
      const closeNoticeEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setDescription(
          `<a:rizz_tick:1531330187160064030> **Closing Ticket...**\n\n` +
          `<a:green_button:1531292779999662181> Ticket close initiated by ${interaction.user}.\n` +
          `<a:Arroww:1531292687188234441> Generating transcript file & sending logs to DM & <#${TRANSCRIPT_CHANNEL_ID}>...\n` +
          `Channel will delete in 5 seconds.`
        );

      await interaction.reply({ embeds: [closeNoticeEmbed] });
      await sendTranscript(ticketId, interaction.user, interaction.channel);
      setTimeout(() => {
        if (interaction.channel && 'delete' in interaction.channel) {
          interaction.channel.delete().catch(() => {});
        }
      }, 5000);
    }
  }
});

// Helper Function: Build Channel Chat Logs
async function buildChannelTranscript(channelObj, data, actor) {
  let messages = [];
  try {
    if (channelObj && channelObj.messages) {
      const fetched = await channelObj.messages.fetch({ limit: 100 });
      messages = Array.from(fetched.values()).reverse();
    }
  } catch (e) {}

  const ticketOwnerTag = data?.user ? `${data.user.tag} (${data.user.id})` : 'Unknown User';
  const claimedStaffTag = data?.claimedUser ? `${data.claimedUser.tag} (${data.claimedUser.id})` : 'Unclaimed / Staff';
  const dealId = data?.dealId || 'N/A';
  const typeStr = data?.type ? `${data.type.toUpperCase()} EXCHANGE` : 'EXCHANGE';

  let logLines = [
    `==================================================`,
    `        COZY EXCHANGE TICKET TRANSCRIPT           `,
    `==================================================`,
    `Deal ID: ${dealId}`,
    `Client: ${ticketOwnerTag}`,
    `Claimed Staff: ${claimedStaffTag}`,
    `Channel: #${channelObj?.name || 'ticket'}`,
    `Category: ${typeStr}`,
    `Closed By: ${actor ? `${actor.tag} (${actor.id})` : 'System/Command'}`,
    `Date & Time: ${new Date().toLocaleString()}`,
    `==================================================\n`,
    `--- CHAT LOGS ---`
  ];

  for (const m of messages) {
    const timeStr = m.createdAt ? m.createdAt.toLocaleTimeString() : '';
    const authorStr = `${m.author.tag}`;
    const textContent = m.content ? m.content : (m.embeds?.length ? '[Embed Message]' : '');
    logLines.push(`[${timeStr}] ${authorStr}: ${textContent}`);
    if (m.attachments?.size > 0) {
      m.attachments.forEach(att => {
        logLines.push(`    [Attachment]: ${att.url}`);
      });
    }
  }

  logLines.push(`\n==================================================`);
  logLines.push(`          END OF TRANSCRIPT                       `);
  logLines.push(`==================================================`);

  return logLines.join('\n');
}

// Helper Function: Send Transcript, DM & History
async function sendTranscript(ticketId, actor, channelObj) {
  const data = ticketDataMap.get(ticketId) || getTicketData(channelObj);
  const ticketOwner = data?.user ? `<@${data.user.id}>` : (actor ? `<@${actor.id}>` : 'User');
  const exchangerUser = data?.claimedUser ? `<@${data.claimedUser.id}>` : '@staff';
  const dealId = data?.dealId || 'N/A';
  const typeStr = data?.type ? `${data.type.toUpperCase()} EXCHANGE` : 'EXCHANGE';
  const dealAmount = data?.modalData?.dealAmount || 'N/A';

  const transcriptText = await buildChannelTranscript(channelObj, data, actor);
  const fileName = `transcript-${channelObj?.name || 'ticket'}.txt`;
  const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), { name: fileName });

  // 1. Send Transcript to TRANSCRIPT_CHANNEL_ID
  const transcriptEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setDescription(
      `<a:green_button:1531292779999662181> **Cozy Ticket Transcript Saved**\n\n` +
      `<a:rizz_tick:1531330187160064030> **Deal ID:** \`${dealId}\`\n` +
      `<:bluee_sup:1531339328561610872> **Client:** ${ticketOwner}\n` +
      `<:Exchangeru:1531340808446542056> **Claimed Staff:** ${exchangerUser}\n` +
      `<a:Arroww:1531292687188234441> **Category:** **${typeStr}**\n` +
      `<:paisa:1531292193829028042> **Deal Amount:** **${dealAmount}**\n` +
      `📁 **Channel:** **#${channelObj?.name || 'ticket'}**\n` +
      `🕒 **Closed At:** **${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}**`
    )
    .setFooter({ text: 'Cozy Exchange & MM • Transcript Logs' })
    .setTimestamp();

  try {
    const transChannel = await client.channels.fetch(TRANSCRIPT_CHANNEL_ID).catch(() => null);
    if (transChannel && 'send' in transChannel) {
      await transChannel.send({ embeds: [transcriptEmbed], files: [attachment] }).catch(() => {});
    }
  } catch (e) {}

  // 2. Send DM to Ticket Owner with Transcript Attachment
  if (data?.user) {
    const dmAttachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), { name: fileName });
    const dmEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(
        `<a:rizz_tick:1531330187160064030> **Your Exchange Ticket Has Been Closed**\n\n` +
        `Hello ${ticketOwner},\n\n` +
        `Your exchange ticket **#${channelObj?.name || 'ticket'}** has been successfully completed and closed.\n\n` +
        `<a:green_button:1531292779999662181> **Deal Overview:**\n` +
        `• **Deal ID:** \`${dealId}\`\n` +
        `• **Exchanger:** ${exchangerUser}\n` +
        `• **Category:** ${typeStr}\n` +
        `• **Amount:** ${dealAmount}\n\n` +
        `📜 **Full Transcript Attached Below!**\n` +
        `Thank you for using Cozy Exchange & MM!`
      )
      .setFooter({ text: 'Cozy Exchange & MM' })
      .setTimestamp();

    await data.user.send({ embeds: [dmEmbed], files: [dmAttachment] }).catch(() => {});
  }

  // 3. Send Exchange Log to HISTORY_CHANNEL_ID
  const historyEmbed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `<a:green_button:1531292779999662181> **Exchange Deal Completed**\n\n` +
      `<a:rizz_tick:1531330187160064030> **Deal ID:** \`${dealId}\`\n` +
      `<:bluee_sup:1531339328561610872> **Client:** ${ticketOwner}\n` +
      `<:Exchangeru:1531340808446542056> **Exchanger:** ${exchangerUser}\n` +
      `<a:Arroww:1531292687188234441> **Category:** **${typeStr}**\n` +
      `<:paisa:1531292193829028042> **Deal Amount:** **${dealAmount}**\n` +
      `📖 **Transcript:** Saved to <#${TRANSCRIPT_CHANNEL_ID}>`
    )
    .setFooter({ text: 'Cozy Exchange & MM • Exchange History' })
    .setTimestamp();

  try {
    const historyChannel = await client.channels.fetch(HISTORY_CHANNEL_ID).catch(() => null);
    if (historyChannel && 'send' in historyChannel) {
      await historyChannel.send({ embeds: [historyEmbed] }).catch(() => {});
    }
  } catch (e) {}
}

// Simple HTTP Health Check Server for Render / Railway 24/7 hosting
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Cozy Ticket Bot is running 24/7!');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Keep-alive web server listening on port ${PORT}`);
});

// Start Discord Bot with Token from Environment Variable
let rawToken = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || process.env.TOKEN || '';
const BOT_TOKEN = rawToken.trim().replace(/^["']|["']$/g, '');

if (!BOT_TOKEN) {
  console.error('ERROR: DISCORD_BOT_TOKEN environment variable is not set!');
  console.log('Set DISCORD_BOT_TOKEN in your host environment variables.');
} else {
  client.login(BOT_TOKEN).catch((err) => {
    console.error('Login error:', err.message);
    if (err.message.includes('TokenInvalid') || err.code === 'TokenInvalid') {
      console.error('\n======================================================');
      console.error('CRITICAL: DISCORD BOT TOKEN IS INVALID OR REVOKED!');
      console.error('1. If your token was pushed to GitHub, Discord automatically revoked it for security.');
      console.error('2. Go to https://discord.com/developers/applications');
      console.error('3. Select your bot -> "Bot" tab -> Click "Reset Token".');
      console.error('4. Copy the NEW token.');
      console.error('5. In Render Dashboard -> Environment -> Set DISCORD_BOT_TOKEN to your NEW token.');
      console.error('======================================================\n');
    }
  });
}
