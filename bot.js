require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  PermissionFlagsBits,
  AttachmentBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Hardcoded Channel & Role IDs
const RULES_CHANNEL_ID = '1532014002694131722';
const TRANSCRIPT_CHANNEL_ID = '1532014023774834889';
const HISTORY_CHANNEL_ID = '1532014041189498881';
const FEEDBACK_CHANNEL_ID = '1532013898083831808';
const EXCHANGER_ROLE_ID = '1532005989879124129';

// Exchange Rates & Category Config
let rates = {
  i2c: '104 INR = $1.00 USD (9.6% Fee)',
  c2i: '$1.00 USD = 88 INR (15.38% Fee)',
  c2c: '5.00% Exchange Fee',
  categoryIds: {
    i2c: '1532013809655578704',
    c2i: '1532013833445539851',
    c2c: '1532013861274751026'
  }
};

// In-Memory Storage maps
const tempExchangeMap = new Map();
const ticketDataMap = new Map();

// Helper Function: Check if channel is a valid ticket channel
function isTicketChannel(channel) {
  if (!channel) return false;
  if (ticketDataMap.has(channel.id)) return true;
  if (channel.parentId && Object.values(rates.categoryIds).includes(channel.parentId)) return true;
  const name = channel.name || '';
  return name.startsWith('i2c-') || name.startsWith('c2i-') || name.startsWith('c2c-') || name.startsWith('claimed-') || name.startsWith('unclaimed-');
}

// Helper Function: Safe lookup of ticket record
function getTicketData(channel) {
  if (!channel) return null;
  if (ticketDataMap.has(channel.id)) return ticketDataMap.get(channel.id);
  for (const [key, val] of ticketDataMap.entries()) {
    if (val.channelId === channel.id) return val;
  }
  return null;
}

client.once('ready', () => {
  console.log(`✅ Cozy Exchange Bot logged in as ${client.user.tag}`);
});

// Handle Commands (!panel, .panel, .vouch, .c, .u, .dn, .done, .close)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const lowerContent = message.content.toLowerCase().trim();

  // Command: !panel, .panel -> SETUP EXCHANGE PANEL
  if (lowerContent === '!panel' || lowerContent === '.panel') {
    const isStaff = message.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                    message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

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

    const panelEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setDescription(
        `<a:green_button:1531292779999662181> **Cozy Exchange Panel**\n\n` +
        `<a:rizz_tick:1531330187160064030> Welcome to **Cozy Exchange & MM**! Choose an exchange option below to open a ticket.\n\n` +
        `<a:Arroww:1531292687188234441> **Exchange Rates:**\n` +
        `• **INR to Crypto (I2C):** ${rates.i2c}\n` +
        `• **Crypto to INR (C2I):** ${rates.c2i}\n` +
        `• **Crypto to Crypto (C2C):** ${rates.c2c}\n\n` +
        `📖 Read our server rules in <#${RULES_CHANNEL_ID}> before starting your trade.`
      )
      .setFooter({ text: 'Cozy Exchange & MM • Instant & Secure' });

    const i2cBtn = new ButtonBuilder()
      .setCustomId('btn_i2c')
      .setLabel('INR to Crypto')
      .setEmoji('1531292193829028042')
      .setStyle(ButtonStyle.Primary);

    const c2iBtn = new ButtonBuilder()
      .setCustomId('btn_c2i')
      .setLabel('Crypto to INR')
      .setEmoji('1531293118580658286')
      .setStyle(ButtonStyle.Success);

    const c2cBtn = new ButtonBuilder()
      .setCustomId('btn_c2c')
      .setLabel('Crypto to Crypto')
      .setEmoji('1531292984132239535')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(i2cBtn, c2iBtn, c2cBtn);

    await message.channel.send({ embeds: [panelEmbed], components: [row] });
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

    const isStaff = message.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                    message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

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

    const isStaff = message.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                    message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

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

    const isStaff = message.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                    message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

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

    const isStaff = message.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                    message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

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

    const isStaff = message.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                    message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

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

// Handle Interactions (Buttons & Modals)
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    if (['btn_i2c', 'btn_c2i', 'btn_c2c'].includes(interaction.customId)) {
      // Step 1: Show initial modal with 3 questions
      if (interaction.customId === 'btn_i2c') {
        const modal = new ModalBuilder().setCustomId('modal_i2c').setTitle('Initiate INR to Crypto Exchange');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('sendingApp')
              .setLabel('sending app name *')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. PhonePe, GPay, Paytm, UPI')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('receivingCrypto')
              .setLabel('receiving crypto name *')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. USDT, LTC, BTC, TRX')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('dealAmount')
              .setLabel('Deal Amount *')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. 1000 INR or $10 USD')
              .setRequired(true)
          )
        );
        await interaction.showModal(modal);
      } else if (interaction.customId === 'btn_c2i') {
        const modal = new ModalBuilder().setCustomId('modal_c2i').setTitle('Initiate Crypto to INR Exchange');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('sendingCrypto')
              .setLabel('sending crypto name *')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. USDT, LTC, BTC')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('receivingWallet')
              .setLabel('receiving wallet/app name *')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. UPI, Bank Transfer, GPay')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('dealAmount')
              .setLabel('Deal Amount *')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. $50 or 5000 INR')
              .setRequired(true)
          )
        );
        await interaction.showModal(modal);
      } else if (interaction.customId === 'btn_c2c') {
        const modal = new ModalBuilder().setCustomId('modal_c2c').setTitle('Initiate Crypto to Crypto Exchange');
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('sendingCrypto')
              .setLabel('sending crypto name *')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. LTC, USDT')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('receivingCrypto')
              .setLabel('receiving crypto name *')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. BTC, TRX, SOL')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('dealAmount')
              .setLabel('Deal Amount *')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. $50')
              .setRequired(true)
          )
        );
        await interaction.showModal(modal);
      }
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('modal_feedback_')) {
      const ticketId = interaction.customId.replace('modal_feedback_', '');
      const ratingRaw = interaction.fields.getTextInputValue('feedback_rating');
      const feedbackText = interaction.fields.getTextInputValue('feedback_text');

      const data = ticketDataMap.get(ticketId) || getTicketData(interaction.channel);
      const exchangerUser = data?.claimedUser ? `<@${data.claimedUser.id}>` : '@staff';

      const numRating = parseInt(ratingRaw.trim());
      let starsStr = ratingRaw;
      if (!isNaN(numRating) && numRating >= 1 && numRating <= 5) {
        starsStr = '⭐'.repeat(numRating);
      }

      const feedbackEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 256 }) || 'https://cdn.discordapp.com/attachments/1531294400657887322/1532019340709466293')
        .setDescription(
          `🌟 **New Customer Feedback**\n\n` +
          `<:star_clients:1531293701853417492> **Submitted By:** <@${interaction.user.id}>\n` +
          `<:Exchangeru:1531340808446542056> **Exchanger:** ${exchangerUser}\n\n` +
          `⭐ **Rating:** ${starsStr} (${ratingRaw})\n\n` +
          `💬 **Feedback:**\n> ${feedbackText.replace(/\n/g, '\n> ')}\n\n` +
          `<a:legiit:1531294113088147637> Cozy Exchange & MM • Verified Review`
        )
        .setTimestamp();

      try {
        const feedbackChan = await client.channels.fetch(FEEDBACK_CHANNEL_ID).catch(() => null);
        if (feedbackChan && 'send' in feedbackChan) {
          await feedbackChan.send({ embeds: [feedbackEmbed] }).catch(() => {});
        }
      } catch (e) {}

      const serverIcon = interaction.guild?.iconURL({ extension: 'png', size: 256 }) || 'https://cdn.discordapp.com/attachments/1531294400657887322/1532019340709466293';
      const feedbackDmEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setThumbnail(serverIcon)
        .setDescription(
          `<a:rizz_tick:1531330187160064030> **Thank You For Your Feedback!**\n\n` +
          `<:shineee:1531341185216676122> **Thanks for your feedback!** 😀 👍\n\n` +
          `Your review has been successfully submitted and posted to <#${FEEDBACK_CHANNEL_ID}>.\n\n` +
          `📝 **Note from Cozy Exchange Team:**\n` +
          `> Thank you for choosing Cozy Exchange & MM! We deeply appreciate your trust in our exchange service. If you ever need assistance, feel free to open a ticket anytime!\n\n` +
          `<a:legiit:1531294113088147637> Cozy Exchange & MM • Trusted & Secure`
        )
        .setFooter({ text: 'Cozy Exchange & MM' })
        .setTimestamp();

      await interaction.user.send({ embeds: [feedbackDmEmbed] }).catch(() => {});
      await interaction.reply({
        content: `✅ **Thank you for your feedback!** Your review has been submitted to <#${FEEDBACK_CHANNEL_ID}>.`,
        ephemeral: true
      }).catch(() => {});
      return;
    }

    const type = interaction.customId.replace('modal_', '');
    const dealAmount = interaction.fields.getTextInputValue('dealAmount');
    const sendingApp = type === 'i2c' ? interaction.fields.getTextInputValue('sendingApp') : '';
    const receivingCrypto = type === 'i2c' || type === 'c2c' ? interaction.fields.getTextInputValue('receivingCrypto') : '';
    const sendingCrypto = type === 'c2i' || type === 'c2c' ? interaction.fields.getTextInputValue('sendingCrypto') : '';
    const receivingWallet = type === 'c2i' ? interaction.fields.getTextInputValue('receivingWallet') : '';

    const tempId = `${type}_${Date.now()}`;
    tempExchangeMap.set(tempId, {
      user: interaction.user,
      type,
      modalData: { dealAmount, isThirdParty: 'No', sendingApp, receivingCrypto, sendingCrypto, receivingWallet }
    });

    // Step 2: Show Third-Party option selection buttons
    const tpSelectEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setDescription(
        `<a:rizz_tick:1531330187160064030> **Select Third-Party Payment Option**\n\n` +
        `Please select whether this exchange involves a Third-Party payment before creating your ticket.\n\n` +
        `**Exchange Details**\n` +
        `• **Type:** ${type.toUpperCase()} EXCHANGE\n` +
        `• **Deal Amount:** ${dealAmount}\n` +
        `• **Sending Asset / App:** ${sendingApp || sendingCrypto || 'N/A'}\n` +
        `• **Receiving Asset / Wallet:** ${receivingCrypto || receivingWallet || 'N/A'}\n\n` +
        `👇 **Click your payment type below:**`
      );

    const tpNoBtn = new ButtonBuilder()
      .setCustomId(`tp_select_no_${tempId}`)
      .setLabel('Third-Party (No)')
      .setEmoji('🟢')
      .setStyle(ButtonStyle.Success);

    const tpYesBtn = new ButtonBuilder()
      .setCustomId(`tp_select_yes_${tempId}`)
      .setLabel('Third-Party (Yes)')
      .setEmoji('🔴')
      .setStyle(ButtonStyle.Danger);

    const tpRow = new ActionRowBuilder().addComponents(tpNoBtn, tpYesBtn);

    await interaction.reply({ embeds: [tpSelectEmbed], components: [tpRow], ephemeral: true });
  } else if (interaction.isButton()) {
    if (interaction.customId.startsWith('tp_select_')) {
      const isYes = interaction.customId.startsWith('tp_select_yes_');
      const tempId = interaction.customId.replace(isYes ? 'tp_select_yes_' : 'tp_select_no_', '');

      const temp = tempExchangeMap.get(tempId);
      if (!temp) {
        await interaction.reply({ content: 'Session expired. Please try again.', ephemeral: true }).catch(() => {});
        return;
      }

      temp.modalData.isThirdParty = isYes ? 'Yes (Third Party Payment)' : 'No (Self Payment)';

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setDescription(
          `<a:rizz_tick:1531330187160064030> **Confirm Your Exchange**\n\n` +
          `Review all the ticket details before your exchange ticket is created.\n\n` +
          `**Exchange Overview**\n` +
          `• **Type:** ${temp.type.toUpperCase()} EXCHANGE\n` +
          `• **Deal Amount:** ${temp.modalData.dealAmount}\n\n` +
          `**Ticket Details**\n` +
          `• **Sending Asset / App:** ${temp.modalData.sendingApp || temp.modalData.sendingCrypto || 'Provided in Ticket'}\n` +
          `• **Receiving Asset / Wallet:** ${temp.modalData.receivingCrypto || temp.modalData.receivingWallet || 'Provided in Ticket'}\n` +
          `• **Third Party Payment:** ${temp.modalData.isThirdParty}\n\n` +
          `✨ Cozy Exchange Trusted And Secure.`
        );

      const confirmBtn = new ButtonBuilder().setCustomId(`confirm_exchange_${tempId}`).setLabel('Confirm Exchange').setStyle(ButtonStyle.Success);
      const cancelBtn = new ButtonBuilder().setCustomId('cancel_exchange').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

      await interaction.update({ embeds: [confirmEmbed], components: [row] });
    } else if (interaction.customId === 'cancel_exchange') {
      try {
        await interaction.deferUpdate();
        await interaction.deleteReply();
      } catch (e) {
        await interaction.reply({ content: 'Cancelled', ephemeral: true }).catch(() => {});
      }
    } else if (interaction.customId.startsWith('confirm_exchange_')) {
      const tempId = interaction.customId.replace('confirm_exchange_', '');
      const temp = tempExchangeMap.get(tempId);
      if (temp) {
        try {
          await interaction.deferUpdate();
          await interaction.deleteReply();
        } catch (e) {}

        const ticketId = Math.floor(1000 + Math.random() * 9000).toString();
        const userClean = temp.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
        const channelName = `${temp.type}-${userClean}-${ticketId}`;
        const dealId = `Cozy-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        if (interaction.guild) {
          const targetCategoryId = rates.categoryIds[temp.type];
          const channel = await interaction.guild.channels.create({
            name: channelName,
            parent: targetCategoryId || null,
            permissionOverwrites: [
              { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
              { id: temp.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] },
              { id: EXCHANGER_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
            ]
          }).catch(() => null);

          if (channel) {
            const ticketRecord = {
              id: ticketId,
              dealId,
              user: temp.user,
              type: temp.type,
              modalData: temp.modalData,
              channelId: channel.id
            };
            ticketDataMap.set(ticketId, ticketRecord);
            ticketDataMap.set(channel.id, ticketRecord);

            const ticketEmbed = new EmbedBuilder()
              .setColor(0x0099ff)
              .setDescription(
                `<a:green_button:1531292779999662181> **Cozy Exchange Ticket**\n\n` +
                `Hello <@${temp.user.id}>\n` +
                `Read Our <#${RULES_CHANNEL_ID}>\n` +
                `<@&${EXCHANGER_ROLE_ID}>\n\n` +
                `<a:rizz_tick:1531330187160064030> **Deal ID:** **${dealId}**\n` +
                `<:bluee_sup:1531339328561610872> **Client:** <@${temp.user.id}>\n` +
                `<a:Arroww:1531292687188234441> **Category:** **${temp.type.toUpperCase()} EXCHANGE**\n\n` +
                `**Payment Details**\n` +
                `<:paisa:1531292193829028042> **Send:** **${temp.modalData.dealAmount}** via ${temp.modalData.sendingApp || temp.modalData.sendingCrypto || 'App/Wallet'}\n` +
                `<:cryptos:1531293118580658286> **Receive:** **${temp.modalData.receivingCrypto || temp.modalData.receivingWallet || 'Crypto/Bank'}**\n` +
                `<:bluebutton:1531292103882047640> **Third Party Payment:** **${temp.modalData.isThirdParty}**`
              )
              .setFooter({ text: 'Cozy Exch & MM' });

            const claimBtn = new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('Claim Ticket').setEmoji('1531294162178277416').setStyle(ButtonStyle.Success);
            const closeBtn = new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('Close Ticket').setEmoji('1531978320986636293').setStyle(ButtonStyle.Danger);
            const reqMmBtn = new ButtonBuilder().setCustomId(`ticket_req_mm_${ticketId}`).setLabel('Request Middleman').setEmoji('1531292984132239535').setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(claimBtn, closeBtn, reqMmBtn);
            await channel.send({ content: `<@${temp.user.id}> <@&${EXCHANGER_ROLE_ID}>`, embeds: [ticketEmbed], components: [row] });
            await interaction.followUp({ content: `Your ticket has been created: <#${channel.id}>`, ephemeral: true }).catch(() => {});
          }
        }
      }
    } else if (interaction.customId.startsWith('feedback_btn_')) {
      const ticketId = interaction.customId.replace('feedback_btn_', '');
      const modal = new ModalBuilder()
        .setCustomId(`modal_feedback_${ticketId}`)
        .setTitle('Cozy Exchange - Feedback');

      const ratingInput = new TextInputBuilder()
        .setCustomId('feedback_rating')
        .setLabel('Rating (1 to 5 Stars)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('5')
        .setRequired(true);

      const feedbackInput = new TextInputBuilder()
        .setCustomId('feedback_text')
        .setLabel('Your Review / Feedback')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Eg. Fast and smooth exchange!')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(ratingInput),
        new ActionRowBuilder().addComponents(feedbackInput)
      );

      await interaction.showModal(modal);
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
          usdVal = data.type === 'i2c' ? (amtStr.includes('$') ? raw : raw / 104) : raw;
        }
      }
      const copyableText = `+rep ${exchangerUser} EXCHANGED ${typeStr} [${usdVal.toFixed(2)}$]`;
      await interaction.reply({
        content: `\`\`\`${copyableText}\`\`\``,
        ephemeral: true
      });
    } else if (interaction.customId.startsWith('ticket_req_mm_')) {
      await interaction.reply({
        content: `<a:rizz_tick:1531330187160064030> **Middleman Requested!** Pinged <@&${EXCHANGER_ROLE_ID}>.`
      });
    } else if (interaction.customId.startsWith('ticket_claim_')) {
      const isStaff = interaction.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                      interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                      interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

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
      const isStaff = interaction.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                      interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                      interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

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
      const isStaff = interaction.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                      interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                      interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

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
  res.end('Cozy Exchange Discord Bot is Running 24/7!');
}).listen(PORT, () => {
  console.log(`🌐 HTTP Uptime server running on port ${PORT}`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
