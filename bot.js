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

  // Command: !panel
  if (lowerContent === '!panel') {
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

  // Command: .vouch
  if (lowerContent.startsWith('.vouch')) {
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
        `<a:rizz_tick:1531330187160064030> ${ticketOwner} Your deal has been Completed successfully \n\n` +
        `\`your Vouch ${copyableText}\`\n\n` +
        `📖 Ticket log has been saved`
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

  // Command: .done
  if (lowerContent === '.done') {
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
        `<a:rizz_tick:1531330187160064030> **Ticket Done**\n\n` +
        `<a:green_button:1531292779999662181> The Ticket Has Been Marked As done And the Exchange Has been completed\n\n` +
        `<a:arruw:1531292459177480304> Transcript Has been saved on Transcript channel`
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
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sendingApp').setLabel('sending INR app *').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('receivingCrypto').setLabel('receiving crypto name *').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('isThirdParty').setLabel('Third Party payment or not *').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dealAmount').setLabel('Deal Amount *').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    } else if (selected === 'c2i') {
      const modal = new ModalBuilder().setCustomId('modal_c2i').setTitle('Initiate Crypto to INR Exchange');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sendingCrypto').setLabel('sending crypto name *').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('receivingWallet').setLabel('Crypto Wallet Name *').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('isThirdParty').setLabel('Third Party payment or not *').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dealAmount').setLabel('Deal Amount *').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    } else if (selected === 'c2c') {
      const modal = new ModalBuilder().setCustomId('modal_c2c').setTitle('Initiate Crypto to Crypto Exchange');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sendingCrypto').setLabel('sending crypto name *').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('receivingCrypto').setLabel('receiving crypto name *').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('isThirdParty').setLabel('Third Party payment or not *').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dealAmount').setLabel('Deal Amount *').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('modal_feedback_')) {
      const ticketId = interaction.customId.replace('modal_feedback_', '');
      const ratingRaw = interaction.fields.getTextInputValue('feedback_rating');
      const feedbackText = interaction.fields.getTextInputValue('feedback_text');
      const FEEDBACK_CHANNEL_ID = '1532423288058417182';

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
          `Your review has been successfully submitted and posted to <#1532423288058417182>.\n\n` +
          `📝 **Note from Cozy Exchange Team:**\n` +
          `> Thank you for choosing Cozy Exchange & MM! We deeply appreciate your trust in our exchange service. If you ever need assistance, feel free to open a ticket anytime!\n\n` +
          `<a:legiit:1531294113088147637> Cozy Exchange & MM • Trusted & Secure`
        )
        .setFooter({ text: 'Cozy Exchange & MM' })
        .setTimestamp();

      await interaction.user.send({ embeds: [feedbackDmEmbed] }).catch(() => {});
      await interaction.reply({
        content: '✅ **Thank you for your feedback!** Your review has been submitted to <#1532423288058417182>.',
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
      .setTitle('<a:rizz_tick:1531330187160064030> Confirm Your Exchange')
      .setColor(0x0099ff)
      .setDescription(`Review all the ticket details before your exchange ticket is created.\n\n` +
        `**Exchange Overview**\n` +
        `Type: ${type.toUpperCase()} EXCHANGE\n` +
        `Deal Amount: ${dealAmount}\n\n` +
        `**Ticket Details**\n` +
        `Wallet / Bank: ${sendingApp || receivingWallet || 'Provided in Ticket'}\n` +
        `Asset Details: ${receivingCrypto || sendingCrypto || 'Crypto'}\n` +
        `Third Party Payment: ${isThirdParty === 'yes' ? 'Yes, Third Party payment' : 'No, Not a third party payment - I am sending myself'}\n\n` +
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
                `<a:rizz_tick:1531330187160064030> Deal ID: **${dealId}**\n` +
                `<:bluee_sup:1531339328561610872> Client: <@${temp.user.id}>\n` +
                `<a:Arroww:1531292687188234441> Category: **${temp.type.toUpperCase()} EXCHANGE**\n\n` +
                `**Payment Details**\n` +
                `<:paisa:1531292193829028042> Send: **${temp.modalData.dealAmount}** via ${temp.modalData.sendingApp || temp.modalData.sendingCrypto || 'App/Wallet'}\n` +
                `<:cryptos:1531293118580658286> Receive: **${temp.modalData.receivingCrypto || temp.modalData.receivingWallet || 'Crypto/Bank'}**\n` +
                `<:bluebutton:1531292103882047640> Third Party Payment: **${temp.modalData.isThirdParty === 'yes' ? 'Yes' : 'No'}**`
              );

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
    } else if (interaction.customId.startsWith('ticket_claim_')) {
      const ticketId = interaction.customId.replace('ticket_claim_', '');
      const data = ticketDataMap.get(ticketId);
      if (data) {
        data.claimedUser = interaction.user;
      }
      await interaction.reply({ content: `<a:rizz_tick:1531330187160064030> Ticket claimed by <@${interaction.user.id}>!` });
    } else if (interaction.customId.startsWith('ticket_close_')) {
      const ticketId = interaction.customId.replace('ticket_close_', '');
      await interaction.reply({ content: 'Closing ticket and sending transcript...' });
      await sendTranscript(ticketId, interaction.user, interaction.channel);
      setTimeout(() => {
        if (interaction.channel && 'delete' in interaction.channel) {
          interaction.channel.delete().catch(() => {});
        }
      }, 3000);
    }
  }
});

// Helper Function: Send Transcript
async function sendTranscript(ticketId, actor, channelObj) {
  const data = ticketDataMap.get(ticketId);
  const ticketOwner = data?.user ? `<@${data.user.id}>` : (actor ? `<@${actor.id}>` : 'User');
  const exchangerUser = data?.claimedUser ? `<@${data.claimedUser.id}>` : '@staff';
  const dealId = data?.dealId || 'N/A';
  const typeStr = data?.type ? `${data.type.toUpperCase()} EXCHANGE` : 'EXCHANGE';

  const transcriptEmbed = new EmbedBuilder()
    .setTitle('📖 Cozy Exchange Ticket Transcript')
    .setColor(0x0099ff)
    .setDescription(
      `Deal ID: **${dealId}**\n` +
      `Client: ${ticketOwner}\n` +
      `Claimed By: ${exchangerUser}\n` +
      `Category: **${typeStr}**\n` +
      `Channel: **#${channelObj?.name || 'ticket'}**\n` +
      `Status: **Closed / Completed**\n` +
      `Time: ${new Date().toLocaleString()}`
    );

  const transcriptText = `=== COZY EXCHANGE TICKET TRANSCRIPT ===\nDeal ID: ${dealId}\nClient: ${data?.user?.tag || 'N/A'}\nExchanger: ${data?.claimedUser?.tag || 'Staff'}\nChannel: #${channelObj?.name || 'ticket'}\nTime: ${new Date().toISOString()}\n==========================================\n`;
  const fileName = `transcript-${channelObj?.name || 'ticket'}.txt`;
  const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), { name: fileName });

  try {
    const transChannel = await client.channels.fetch(TRANSCRIPT_CHANNEL_ID).catch(() => null);
    if (transChannel && 'send' in transChannel) {
      await transChannel.send({ embeds: [transcriptEmbed], files: [attachment] }).catch(() => {});
    }
  } catch (e) {}
}

// Start Discord Bot with Token from Environment Variable or Hardcoded
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('ERROR: DISCORD_BOT_TOKEN environment variable is not set!');
  console.log('Set DISCORD_BOT_TOKEN in your host environment variables.');
} else {
  client.login(BOT_TOKEN);
      }
