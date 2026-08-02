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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Roles & Config Constants
const EXCHANGER_ROLE_ID = '1532005989879124129';
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

  // 1. Check in ticketDataMap
  for (const [id, t] of ticketDataMap.entries()) {
    if (t.channelId === channel.id || (id && channel.name.includes(id))) {
      return true;
    }
  }

  // 2. Check if parent category matches exchange categories
  if (channel.parentId && Object.values(rates.categoryIds).includes(channel.parentId)) {
    return true;
  }

  // 3. Check channel name pattern
  const name = channel.name.toLowerCase();
  if (/^(i2c|c2i|c2c|ticket|deal)-/.test(name)) {
    return true;
  }

  return false;
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
    const isStaff = message.member?.roles?.cache?.has(EXCHANGER_ROLE_ID) || 
                    message.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);

    if (!isStaff) {
      const reply = await message.channel.send('❌ **Only staff members can run the panel setup command!**');
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Cozy Exchange Panel')
      .setColor(0x0099ff)
      .setDescription(
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
      const reply = await message.channel.send('❌ **This command can only be used inside an active ticket channel!**');
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const channelName = message.channel.name || '';
    let ticketId = null;
    let data = null;
    for (const [id, t] of ticketDataMap.entries()) {
      if (t.channelId === message.channel.id || channelName.includes(id)) {
        ticketId = id;
        data = t;
        break;
      }
    }

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
        .setCustomId(`copy_vouch_${ticketId || 'default'}`)
        .setLabel('Copy Vouch')
        .setEmoji('1531292779999662181')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`feedback_btn_${ticketId || 'default'}`)
        .setLabel('Give Feedback')
        .setEmoji('⭐')
        .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({ embeds: [vouchEmbed], components: [copyBtnRow] });
    return;
  }

  // Command: .c, .u, .dn, .done, .close, !c, !u, !dn, !done, !close
  if (['.c', '!c', '.u', '!u', '.dn', '!dn', '.done', '!done', '.close', '!close'].includes(lowerContent)) {
    if (!isTicketChannel(message.channel)) {
      const reply = await message.channel.send('❌ **This command can only be used inside an active ticket channel!**');
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 5000);
      return;
    }

    const channelName = message.channel.name || '';
    let foundTicketId = null;
    for (const [id, t] of ticketDataMap.entries()) {
      if (t.channelId === message.channel.id || channelName.includes(id)) {
        foundTicketId = id;
        break;
      }
    }

    const doneEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(
        `<a:rizz_tick:1531330187160064030> **Ticket Closed / Completed**\n\n` +
        `<a:green_button:1531292779999662181> The ticket has been closed by ${message.author}.\n\n` +
        `<a:Arroww:1531292687188234441> Generating full transcript & saving log to DM and <#${TRANSCRIPT_CHANNEL_ID}>...\n` +
        `This channel will auto-delete in 5 seconds.`
      );
    await message.channel.send({ embeds: [doneEmbed] });

    await sendTranscript(foundTicketId, message.author, message.channel);

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
          new TextInputBuilder()
            .setCustomId('sendingApp')
            .setLabel('sending INR app *')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. GPay, PhonePe, Paytm, UPI')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('receivingCrypto')
            .setLabel('receiving crypto name *')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. LTC, USDT TRC20, BTC, TRX')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('isThirdParty')
            .setLabel('Third Party payment or not *')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. No (Self payment) or Yes (Third Party)')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('dealAmount')
            .setLabel('Deal Amount *')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 5000 INR or $50')
            .setRequired(true)
        )
      );
      await interaction.showModal(modal);
    } else if (selected === 'c2i') {
      const modal = new ModalBuilder().setCustomId('modal_c2i').setTitle('Initiate Crypto to INR Exchange');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('sendingCrypto')
            .setLabel('sending crypto name *')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. LTC, USDT, BTC, TRX')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('receivingWallet')
            .setLabel('Crypto Wallet Name *')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Binance, Trust Wallet, Exodus')
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('isThirdParty')
            .setLabel('Third Party payment or not *')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. No (Self) or Yes (Third Party)')
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
    } else if (selected === 'c2c') {
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
            .setCustomId('isThirdParty')
            .setLabel('Third Party payment or not *')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. No or Yes')
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
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('modal_feedback_')) {
      const ticketId = interaction.customId.replace('modal_feedback_', '');
      const ratingRaw = interaction.fields.getTextInputValue('feedback_rating');
      const feedbackText = interaction.fields.getTextInputValue('feedback_text');

      const data = ticketDataMap.get(ticketId);
      const exchangerUser = data?.claimedUser ? `<@${data.claimedUser.id}>` : '@staff';

      const numRating = parseInt(ratingRaw.trim());
      let starsStr = ratingRaw;
      if (!isNaN(numRating) && numRating >= 1 && numRating <= 5) {
        starsStr = '⭐'.repeat(numRating);
      }

      const feedbackEmbed = new EmbedBuilder()
        .setTitle('🌟 New Customer Feedback')
        .setColor(0x00ff00)
        .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 256 }) || 'https://cdn.discordapp.com/attachments/1531294400657887322/1532019340709466293')
        .setDescription(
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
        .setTitle('<a:rizz_tick:1531330187160064030> Thank You For Your Feedback!')
        .setColor(0x00ff00)
        .setThumbnail(serverIcon)
        .setDescription(
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
    const isThirdParty = interaction.fields.getTextInputValue('isThirdParty');
    const sendingApp = type === 'i2c' ? interaction.fields.getTextInputValue('sendingApp') : '';
    const receivingCrypto = type === 'i2c' || type === 'c2c' ? interaction.fields.getTextInputValue('receivingCrypto') : '';
    const sendingCrypto = type === 'c2i' || type === 'c2c' ? interaction.fields.getTextInputValue('sendingCrypto') : '';
    const receivingWallet = type === 'c2i' ? interaction.fields.getTextInputValue('receivingWallet') : '';

    const confirmEmbed = new EmbedBuilder()
      .setTitle('<a:rizz_tick:1531330187160064030> **Confirm Your Exchange**')
      .setColor(0x0099ff)
      .setDescription(
        `Review all the ticket details before your exchange ticket is created.\n\n` +
        `**Exchange Overview**\n` +
        `• **Type:** ${type.toUpperCase()} EXCHANGE\n` +
        `• **Deal Amount:** ${dealAmount}\n\n` +
        `**Ticket Details**\n` +
        `• **Sending Asset / App:** ${sendingApp || sendingCrypto || 'Provided in Ticket'}\n` +
        `• **Receiving Asset / Wallet:** ${receivingCrypto || receivingWallet || 'Provided in Ticket'}\n` +
        `• **Third Party Payment:** ${isThirdParty.toLowerCase().includes('yes') ? 'Yes (Third Party Payment)' : 'No (Self Payment)'}\n\n` +
        `✨ Cozy Exchange Trusted And Secure.`
      );

    const confirmBtn = new ButtonBuilder().setCustomId(`confirm_exchange_${type}_${Date.now()}`).setLabel('Confirm').setStyle(ButtonStyle.Success);
    const cancelBtn = new ButtonBuilder().setCustomId('cancel_exchange').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

    tempExchangeMap.set(confirmBtn.data.custom_id, { user: interaction.user, type, modalData: { dealAmount, isThirdParty, sendingApp, receivingCrypto, sendingCrypto, receivingWallet } });
    await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
  } else if (interaction.isButton()) {
    if (interaction.customId === 'cancel_exchange') {
      try {
        await interaction.deferUpdate();
        await interaction.deleteReply();
      } catch (e) {
        await interaction.reply({ content: 'Cancelled', ephemeral: true }).catch(() => {});
      }
    } else if (interaction.customId.startsWith('confirm_exchange_')) {
      const temp = tempExchangeMap.get(interaction.customId);
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
            ticketDataMap.set(ticketId, { id: ticketId, dealId, user: temp.user, type: temp.type, modalData: temp.modalData, channelId: channel.id });

            const ticketEmbed = new EmbedBuilder()
              .setTitle('<a:green_button:1531292779999662181> **Cozy Exchange Ticket**')
              .setColor(0x0099ff)
              .setDescription(
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
      const data = ticketDataMap.get(ticketId);
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
      const ticketId = interaction.customId.replace('ticket_claim_', '');
      const data = ticketDataMap.get(ticketId);
      if (data) {
        data.claimedUser = interaction.user;
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
      const ticketId = interaction.customId.replace('ticket_unclaim_', '');
      const data = ticketDataMap.get(ticketId);
      if (data) {
        data.claimedUser = null;
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
          `Unclaimed by <@${interaction.user.id}>. The ticket is now available for other staff members to claim.`
        );

      await interaction.reply({ embeds: [unclaimEmbed] });
    } else if (interaction.customId.startsWith('ticket_close_')) {
      const ticketId = interaction.customId.replace('ticket_close_', '');
      const closeNoticeEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setDescription(
          `<a:rizz_tick:1531330187160064030> **Closing Ticket**\n\n` +
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
  const data = ticketDataMap.get(ticketId);
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
    .setTitle('<a:green_button:1531292779999662181> **Cozy Ticket Transcript Saved**')
    .setColor(0x0099ff)
    .setDescription(
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
      .setTitle('<a:rizz_tick:1531330187160064030> Your Exchange Ticket Has Been Closed')
      .setColor(0x00ff00)
      .setDescription(
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
    .setTitle('<a:green_button:1531292779999662181> **Exchange Deal Completed**')
    .setColor(0x00ff00)
    .setDescription(
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
}).listen(PORT, () => {
  console.log(`Keep-alive web server listening on port ${PORT}`);
});

// Start Discord Bot with Token from Environment Variable
let rawToken = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN || '';
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
