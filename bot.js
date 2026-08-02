const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Role & Channel Configurations
const EXCHANGER_ROLE_ID = '1532005989879124129';

// Helper to reliably check if a member has the required staff role (<@&1532005989879124129>) or admin perms
async function isStaffMember(memberOrUser, guild) {
  if (!memberOrUser) return false;
  let member = memberOrUser;
  
  // If member is a User object or roles cache is missing, fetch full GuildMember from guild
  if (guild && (!member.roles || !('cache' in member.roles))) {
    member = await guild.members.fetch(memberOrUser.id || memberOrUser).catch(() => null);
  }
  if (!member || !member.roles) return false;

  const hasRole = member.roles.cache ? member.roles.cache.has(EXCHANGER_ROLE_ID) : (Array.isArray(member.roles) && member.roles.includes(EXCHANGER_ROLE_ID));
  const isAdmin = member.permissions?.has ? (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) : false;

  return hasRole || isAdmin;
}

const TRANSCRIPT_CHANNEL_ID = '1531286414757593178';
const HISTORY_CHANNEL_ID = '1531286413289656411';
const RULES_CHANNEL_ID = '1531286418025091171';
const FEEDBACK_CHANNEL_ID = '1531286416200237128';

// Store ticket & temporary state in memory
const ticketDataMap = new Map(); // channelId -> ticketData
const tempTicketMap = new Map(); // userId -> tempCreationData

// Helper: check if a channel is a ticket channel
function isTicketChannel(channel) {
  if (!channel || !channel.name) return false;
  return channel.name.startsWith('ticket-') || channel.name.startsWith('done-') || ticketDataMap.has(channel.id);
}

// Helper: retrieve ticket data from topic or memory
function getTicketData(channel) {
  if (ticketDataMap.has(channel.id)) {
    return ticketDataMap.get(channel.id);
  }
  if (channel.topic && channel.topic.includes('Owner:')) {
    const ownerMatch = channel.topic.match(/Owner:\s*<@!?(\d+)>/);
    const exchangerMatch = channel.topic.match(/Exchanger:\s*(<@!?\d+>|None)/);
    const dealMatch = channel.topic.match(/Deal ID:\s*`([^`]+)`/);
    const typeMatch = channel.topic.match(/Type:\s*([^\n|]+)/);
    return {
      user: ownerMatch ? { id: ownerMatch[1], tag: `<@${ownerMatch[1]}>` } : { id: 'Unknown', tag: 'Unknown' },
      exchanger: exchangerMatch && exchangerMatch[1] !== 'None' ? exchangerMatch[1] : 'None',
      dealId: dealMatch ? dealMatch[1] : 'COZY-' + Math.floor(1000 + Math.random() * 9000),
      type: typeMatch ? typeMatch[1].trim() : 'EXCHANGE'
    };
  }
  return null;
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}! Cozy Ticket Bot is ready.`);
});

// Event: Prefix Commands
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
        `<a:green_button:1531292779999662181> **Cozy Exchange Ticket System**\n\n` +
        `<:star_clients:1531293701853417492> Welcome to **Cozy Exchange**! Please select the type of exchange you wish to perform from the dropdown menu below.\n\n` +
        `**Exchange Options:**\n` +
        `<:icons_Inr:1531341857991430155> **INR to Crypto** — Pay INR and receive Cryptocurrency\n` +
        `<:Crypto:1531341855663653018> **Crypto to INR** — Pay Cryptocurrency and receive INR\n` +
        `<:Crypto:1531341855663653018> **Crypto to Crypto** — Swap one Cryptocurrency for another\n\n` +
        `⚠️ **Important Notice:**\n` +
        `• Make sure to read our <#${RULES_CHANNEL_ID}> before creating a ticket.\n` +
        `• Only staff with <@&${EXCHANGER_ROLE_ID}> will assist you.`
      )
      .setImage('https://cdn.discordapp.com/attachments/1531294400657887322/1532019340709466293/6347f71aa5a3b91fa81d2a4eb923dd85.png');

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_exchange_type')
      .setPlaceholder('Select Exchange Type...')
      .addOptions([
        {
          label: 'INR to Crypto',
          description: 'Exchange Indian Rupees for Cryptocurrency',
          value: 'inr_to_crypto',
          emoji: '1531341857991430155'
        },
        {
          label: 'Crypto to INR',
          description: 'Exchange Cryptocurrency for Indian Rupees',
          value: 'crypto_to_inr',
          emoji: '1531341855663653018'
        },
        {
          label: 'Crypto to Crypto',
          description: 'Exchange one Cryptocurrency for another',
          value: 'crypto_to_crypto',
          emoji: '1531341855663653018'
        }
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await message.channel.send({ embeds: [embed], components: [row] });
    message.delete().catch(() => {});
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
    const ticketOwnerId = data?.user?.id;

    if (!ticketOwnerId) {
      const reply = await message.channel.send('❌ **Could not determine the ticket owner.**');
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      return;
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`feedback_btn_${ticketOwnerId}`)
        .setLabel('Submit Feedback / Vouch')
        .setStyle(ButtonStyle.Success)
        .setEmoji('1531293701853417492')
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(
        `<a:rizz_tick:1531330187160064030> **Leave Your Feedback!**\n\n` +
        `Hey <@${ticketOwnerId}>!\n\n` +
        `Thank you for exchanging with **Cozy Exchange**! Please click the button below to submit your rating & vouch for our service.\n\n` +
        `Your feedback will be automatically posted in <#${FEEDBACK_CHANNEL_ID}>.`
      );

    await message.channel.send({ content: `<@${ticketOwnerId}>`, embeds: [embed], components: [row] });
    message.delete().catch(() => {});
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
      data.exchanger = `<@${message.author.id}>`;
      ticketDataMap.set(message.channel.id, data);

      const oldTopic = message.channel.topic || '';
      const updatedTopic = oldTopic.includes('Exchanger:') 
        ? oldTopic.replace(/Exchanger:\s*(<@!?\d+>|None)/, `Exchanger: <@${message.author.id}>`)
        : `${oldTopic} | Exchanger: <@${message.author.id}>`;
      message.channel.setTopic(updatedTopic).catch(() => {});
    }

    const claimEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(`<a:rizz_tick:1531330187160064030> **Ticket Claimed!** This ticket is now claimed by <@${message.author.id}>.`);

    await message.channel.send({ embeds: [claimEmbed] });
    message.delete().catch(() => {});
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
      data.exchanger = 'None';
      ticketDataMap.set(message.channel.id, data);

      const oldTopic = message.channel.topic || '';
      const updatedTopic = oldTopic.replace(/Exchanger:\s*(<@!?\d+>|None)/, 'Exchanger: None');
      message.channel.setTopic(updatedTopic).catch(() => {});
    }

    const unclaimEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(`⚠️ **Ticket Unclaimed!** <@${message.author.id}> has unclaimed this ticket.`);

    await message.channel.send({ embeds: [unclaimEmbed] });
    message.delete().catch(() => {});
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

    if (!message.channel.name.startsWith('done-')) {
      const newName = 'done-' + message.channel.name.replace(/^ticket-/, '');
      await message.channel.setName(newName).catch(() => {});
    }

    const doneEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(`<a:rizz_tick:1531330187160064030> **Ticket Marked as Completed!** Use \`.close\` or \`!close\` to close and generate a transcript.`);

    await message.channel.send({ embeds: [doneEmbed] });
    message.delete().catch(() => {});
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

    const closeNoticeEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(`<a:rizz_tick:1531330187160064030> **Closing ticket in 5 seconds...** Generating transcript and logs.`);

    await message.channel.send({ embeds: [closeNoticeEmbed] });
    message.delete().catch(() => {});

    setTimeout(async () => {
      try {
        await closeAndSaveTranscript(message.channel, message.guild, message.author);
      } catch (err) {
        console.error('Error closing ticket:', err);
      }
    }, 5000);
    return;
  }
});

// Event: Interactions (Select Menu, Modals, Buttons)
client.on('interactionCreate', async (interaction) => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'select_exchange_type') {
      const val = interaction.values[0];

      tempTicketMap.set(interaction.user.id, {
        type: val,
        user: interaction.user
      });

      if (val === 'inr_to_crypto') {
        const modal = new ModalBuilder()
          .setCustomId('modal_i2c')
          .setTitle('Initiate INR to Crypto Exchange');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('inr_amount')
              .setLabel('INR Amount You Give')
              .setPlaceholder('e.g., 5000 INR')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('crypto_payout')
              .setLabel('Crypto & Payout Address You Want')
              .setPlaceholder('e.g., USDT TRC20: Txxxxx...')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('payment_method')
              .setLabel('Your INR Payment Method')
              .setPlaceholder('e.g., UPI / GPay / PhonePe / Bank Transfer')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        await interaction.showModal(modal);
      } else if (val === 'crypto_to_inr') {
        const modal = new ModalBuilder()
          .setCustomId('modal_c2i')
          .setTitle('Initiate Crypto to INR Exchange');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('crypto_amount')
              .setLabel('Crypto Amount & Coin You Give')
              .setPlaceholder('e.g., 100 USDT TRC20')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('inr_payout')
              .setLabel('Your INR Payout Method (UPI / Bank)')
              .setPlaceholder('e.g., UPI ID: user@upi or Bank details')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        await interaction.showModal(modal);
      } else if (val === 'crypto_to_crypto') {
        const modal = new ModalBuilder()
          .setCustomId('modal_c2c')
          .setTitle('Initiate Crypto to Crypto Exchange');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('crypto_send')
              .setLabel('Crypto You Send')
              .setPlaceholder('e.g., 50 USDT TRC20')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('crypto_receive')
              .setLabel('Crypto You Want to Receive')
              .setPlaceholder('e.g., LTC / Sol / TRX')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('payout_address')
              .setLabel('Your Receiving Wallet Address')
              .setPlaceholder('e.g., Lxxxx... or 0x...')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        await interaction.showModal(modal);
      }
    }
  } else if (interaction.isModalSubmit()) {
    const temp = tempTicketMap.get(interaction.user.id) || { type: 'exchange', user: interaction.user };
    
    if (interaction.customId === 'modal_i2c') {
      const inrAmount = interaction.fields.getTextInputValue('inr_amount');
      const cryptoPayout = interaction.fields.getTextInputValue('crypto_payout');
      const paymentMethod = interaction.fields.getTextInputValue('payment_method');

      temp.modalData = { inrAmount, cryptoPayout, paymentMethod };
    } else if (interaction.customId === 'modal_c2i') {
      const cryptoAmount = interaction.fields.getTextInputValue('crypto_amount');
      const inrPayout = interaction.fields.getTextInputValue('inr_payout');

      temp.modalData = { cryptoAmount, inrPayout };
    } else if (interaction.customId === 'modal_c2c') {
      const cryptoSend = interaction.fields.getTextInputValue('crypto_send');
      const cryptoReceive = interaction.fields.getTextInputValue('crypto_receive');
      const payoutAddress = interaction.fields.getTextInputValue('payout_address');

      temp.modalData = { cryptoSend, cryptoReceive, payoutAddress };
    }

    tempTicketMap.set(interaction.user.id, temp);

    // Step 2: Show Third-Party option selection buttons
    const tpSelectEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setDescription(
        `<a:rizz_tick:1531330187160064030> **Select Third-Party Payment Option**\n\n` +
        `Please select whether this exchange involves a Third-Party payment before creating your ticket.\n\n` +
        `**Exchange Details**\n` +
        `• **Type:** ${temp.type.toUpperCase()} EXCHANGE\n` +
        `• **Client:** <@${temp.user.id}>`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tp_yes')
        .setLabel('Yes (Third Party Payment)')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('⚠️'),
      new ButtonBuilder()
        .setCustomId('tp_no')
        .setLabel('No (Self Payment)')
        .setStyle(ButtonStyle.Success)
        .setEmoji('1531330187160064030')
    );

    await interaction.reply({ embeds: [tpSelectEmbed], components: [row], ephemeral: true });
  } else if (interaction.isButton()) {
    if (['tp_yes', 'tp_no'].includes(interaction.customId)) {
      const temp = tempTicketMap.get(interaction.user.id);
      if (!temp || !temp.modalData) {
        await interaction.reply({ content: '❌ Session expired. Please restart ticket creation.', ephemeral: true });
        return;
      }

      const isYes = interaction.customId === 'tp_yes';
      temp.modalData.isThirdParty = isYes ? 'Yes (Third Party Payment)' : 'No (Self Payment)';

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setDescription(
          `<a:rizz_tick:1531330187160064030> **Confirm Your Exchange**\n\n` +
          `Review all the ticket details before your exchange ticket is created.\n\n` +
          `**Exchange Overview**\n` +
          `• **Type:** ${temp.type.toUpperCase()} EXCHANGE\n` +
          `• **Client:** <@${temp.user.id}>\n` +
          `• **Third Party:** ${temp.modalData.isThirdParty}\n\n` +
          `Click **Confirm & Create Ticket** below to proceed.`
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('create_ticket_confirm')
          .setLabel('Confirm & Create Ticket')
          .setStyle(ButtonStyle.Success)
          .setEmoji('1531292779999662181')
      );

      await interaction.update({ embeds: [confirmEmbed], components: [row] });
    } else if (interaction.customId === 'create_ticket_confirm') {
      const temp = tempTicketMap.get(interaction.user.id);
      if (!temp || !temp.modalData) {
        await interaction.reply({ content: '❌ Session expired. Please restart ticket creation.', ephemeral: true });
        return;
      }

      const guild = interaction.guild;
      const dealId = 'COZY-' + Math.floor(1000 + Math.random() * 9000);
      const cleanUsername = temp.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
      const channelName = `ticket-${cleanUsername || 'exchange'}`;

      try {
        const channel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          topic: `Owner: <@${temp.user.id}> | Exchanger: None | Deal ID: \`${dealId}\` | Type: ${temp.type}`,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: temp.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            },
            {
              id: EXCHANGER_ROLE_ID,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            }
          ]
        });

        const ticketRecord = {
          user: temp.user,
          exchanger: 'None',
          dealId: dealId,
          type: temp.type,
          modalData: temp.modalData
        };

        ticketDataMap.set(channel.id, ticketRecord);

        const ticketEmbed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setDescription(
            `<a:green_button:1531292779999662181> **Cozy Exchange Ticket**\n\n` +
            `Hello <@${temp.user.id}>\n` +
            `Read Our <#${RULES_CHANNEL_ID}>\n` +
            `<@&${EXCHANGER_ROLE_ID}>\n\n` +
            `**Exchange Details:**\n` +
            `• **Type:** ${temp.type.toUpperCase()} EXCHANGE\n` +
            `• **Third Party:** ${temp.modalData.isThirdParty}\n` +
            (temp.modalData.inrAmount ? `• **INR Amount:** ${temp.modalData.inrAmount}\n` : '') +
            (temp.modalData.cryptoPayout ? `• **Crypto & Wallet:** ${temp.modalData.cryptoPayout}\n` : '') +
            (temp.modalData.paymentMethod ? `• **Payment Method:** ${temp.modalData.paymentMethod}\n` : '') +
            (temp.modalData.cryptoAmount ? `• **Crypto Amount:** ${temp.modalData.cryptoAmount}\n` : '') +
            (temp.modalData.inrPayout ? `• **INR Payout:** ${temp.modalData.inrPayout}\n` : '') +
            (temp.modalData.cryptoSend ? `• **Crypto Send:** ${temp.modalData.cryptoSend}\n` : '') +
            (temp.modalData.cryptoReceive ? `• **Crypto Receive:** ${temp.modalData.cryptoReceive}\n` : '') +
            (temp.modalData.payoutAddress ? `• **Payout Address:** ${temp.modalData.payoutAddress}\n` : '') +
            `\n**Deal ID:** \`${dealId}\`\n\n` +
            `Please wait for an official exchanger to claim your ticket.`
          );

        const ticketActionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_claim_${channel.id}`)
            .setLabel('Claim Ticket')
            .setStyle(ButtonStyle.Success)
            .setEmoji('1531330187160064030'),
          new ButtonBuilder()
            .setCustomId(`ticket_unclaim_${channel.id}`)
            .setLabel('Unclaim')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚠️'),
          new ButtonBuilder()
            .setCustomId(`ticket_req_mm_${channel.id}`)
            .setLabel('Request MM')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('1531340808446542056'),
          new ButtonBuilder()
            .setCustomId(`ticket_close_${channel.id}`)
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('✖️')
        );

        await channel.send({
          content: `<@${temp.user.id}> <@&${EXCHANGER_ROLE_ID}>`,
          embeds: [ticketEmbed],
          components: [ticketActionRow]
        });

        await interaction.update({
          content: `<a:rizz_tick:1531330187160064030> **Ticket Created Successfully!** Join your ticket channel here: <#${channel.id}>`,
          embeds: [],
          components: []
        });

        tempTicketMap.delete(interaction.user.id);
      } catch (err) {
        console.error('Error creating channel:', err);
        await interaction.reply({ content: '❌ Failed to create ticket channel. Please check bot permissions.', ephemeral: true });
      }
    } else if (interaction.customId.startsWith('feedback_btn_')) {
      const targetUserId = interaction.customId.replace('feedback_btn_', '');
      
      if (interaction.user.id !== targetUserId) {
        await interaction.reply({
          content: '❌ **Only the client who opened this ticket can submit feedback!**',
          ephemeral: true
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`submit_feedback_modal_${targetUserId}`)
        .setTitle('Cozy Exchange - Feedback');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('rating')
            .setLabel('Rating (1 to 5 Stars)')
            .setPlaceholder('e.g., 5')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(1)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('review')
            .setLabel('Your Review / Feedback')
            .setPlaceholder('Tell us about your exchange experience...')
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
        data.exchanger = `<@${interaction.user.id}>`;
        ticketDataMap.set(ticketId, data);

        const oldTopic = interaction.channel.topic || '';
        const updatedTopic = oldTopic.includes('Exchanger:') 
          ? oldTopic.replace(/Exchanger:\s*(<@!?\d+>|None)/, `Exchanger: <@${interaction.user.id}>`)
          : `${oldTopic} | Exchanger: <@${interaction.user.id}>`;
        interaction.channel.setTopic(updatedTopic).catch(() => {});
      }

      const claimEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setDescription(`<a:rizz_tick:1531330187160064030> **Ticket Claimed!** This ticket is now claimed by <@${interaction.user.id}>.`);

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
        data.exchanger = 'None';
        ticketDataMap.set(ticketId, data);

        const oldTopic = interaction.channel.topic || '';
        const updatedTopic = oldTopic.replace(/Exchanger:\s*(<@!?\d+>|None)/, 'Exchanger: None');
        interaction.channel.setTopic(updatedTopic).catch(() => {});
      }

      const unclaimEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`⚠️ **Ticket Unclaimed!** <@${interaction.user.id}> has unclaimed this ticket.`);

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
        .setDescription(`<a:rizz_tick:1531330187160064030> **Closing ticket in 5 seconds...** Generating transcript and logs.`);

      await interaction.reply({ embeds: [closeNoticeEmbed] });

      setTimeout(async () => {
        try {
          await closeAndSaveTranscript(interaction.channel, interaction.guild, interaction.user);
        } catch (err) {
          console.error('Error closing ticket from button:', err);
        }
      }, 5000);
    }
  } else if (interaction.isModalSubmit() && interaction.customId.startsWith('submit_feedback_modal_')) {
    const ratingRaw = interaction.fields.getTextInputValue('rating');
    const review = interaction.fields.getTextInputValue('review');
    const data = getTicketData(interaction.channel) || { exchanger: 'Staff Team' };
    const exchangerUser = data.exchanger !== 'None' ? data.exchanger : 'Staff Team';

    const numStars = Math.min(Math.max(parseInt(ratingRaw) || 5, 1), 5);
    const starsStr = '⭐'.repeat(numStars);

    const feedbackChannel = interaction.guild.channels.cache.get(FEEDBACK_CHANNEL_ID);
    if (feedbackChannel) {
      const feedbackEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 256 }) || 'https://cdn.discordapp.com/attachments/1531294400657887322/1532019340709466293')
        .setDescription(
          `🌟 **New Customer Feedback**\n\n` +
          `<:star_clients:1531293701853417492> **Submitted By:** <@${interaction.user.id}>\n` +
          `<:Exchangeru:1531340808446542056> **Exchanger:** ${exchangerUser}\n\n` +
          `⭐ **Rating:** ${starsStr} (${ratingRaw})\n\n` +
          `📝 **Review:**\n${review}`
        )
        .setFooter({ text: 'Cozy Exchange Feedback Engine', iconURL: interaction.guild.iconURL({ extension: 'png' }) });

      await feedbackChannel.send({ embeds: [feedbackEmbed] });
    }

    // Direct Message thank you to client
    try {
      const serverIcon = interaction.guild?.iconURL({ extension: 'png', size: 256 }) || 'https://cdn.discordapp.com/attachments/1531294400657887322/1532019340709466293';
      const feedbackDmEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setThumbnail(serverIcon)
        .setDescription(
          `<a:rizz_tick:1531330187160064030> **Thank You For Your Feedback!**\n\n` +
          `<:shineee:1531341185216676122> **Thanks for your feedback!** 😀 👍\n\n` +
          `Your review has been successfully submitted and posted to <#${FEEDBACK_CHANNEL_ID}>.\n\n` +
          `📝 **Note from Cozy Exchange Team:**\n` +
          `We truly appreciate your trust in Cozy Exchange. If you need any future exchanges, our team is always ready to assist you!`
        );

      await interaction.user.send({ embeds: [feedbackDmEmbed] });
    } catch (e) {
      console.log('Could not DM user thank you message:', e);
    }

    await interaction.reply({
      content: '<a:rizz_tick:1531330187160064030> **Thank you! Your feedback has been submitted successfully.**',
      ephemeral: true
    });
  }
});

// Function to generate transcript text, save to channel, DM user, and log history
async function closeAndSaveTranscript(channelObj, guildObj, closedBy) {
  const data = ticketDataMap.get(channelObj.id) || getTicketData(channelObj);
  const dealId = data?.dealId || 'COZY-' + Math.floor(1000 + Math.random() * 9000);
  const ticketOwner = data?.user?.id ? `<@${data.user.id}>` : (data?.user?.tag || 'Client');
  const exchangerUser = data?.exchanger || 'Unclaimed';

  // Fetch messages in ticket channel
  let fetchedMessages = [];
  try {
    const msgs = await channelObj.messages.fetch({ limit: 100 });
    fetchedMessages = Array.from(msgs.values()).reverse();
  } catch (err) {
    console.error('Error fetching channel messages for transcript:', err);
  }

  // Format transcript
  let transcriptText = `=====================================================\n`;
  transcriptText += `           COZY EXCHANGE TICKET TRANSCRIPT           \n`;
  transcriptText += `=====================================================\n`;
  transcriptText += `Deal ID: ${dealId}\n`;
  transcriptText += `Channel: #${channelObj.name}\n`;
  transcriptText += `Client: ${data?.user?.tag || ticketOwner}\n`;
  transcriptText += `Exchanger: ${exchangerUser}\n`;
  transcriptText += `Closed By: ${closedBy.tag} (${closedBy.id})\n`;
  transcriptText += `Date: ${new Date().toISOString()}\n`;
  transcriptText += `=====================================================\n\n`;

  for (const m of fetchedMessages) {
    const timestamp = new Date(m.createdTimestamp).toLocaleString();
    transcriptText += `[${timestamp}] ${m.author.tag}: ${m.content}\n`;
    if (m.embeds.length > 0) {
      for (const e of m.embeds) {
        if (e.description) transcriptText += `   [EMBED DESC]: ${e.description.replace(/\n/g, ' ')}\n`;
      }
    }
  }

  const fileName = `transcript-${channelObj.name}-${dealId}.txt`;
  const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), { name: fileName });

  // 1. Send Transcript to TRANSCRIPT_CHANNEL_ID
  const transcriptEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setDescription(
      `<a:green_button:1531292779999662181> **Cozy Ticket Transcript Saved**\n\n` +
      `<a:rizz_tick:1531330187160064030> **Deal ID:** \`${dealId}\`\n` +
      `<:bluee_sup:1531339328561610872> **Client:** ${ticketOwner}\n` +
      `<:Exchangeru:1531340808446542056> **Claimed Staff:** ${exchangerUser}\n` +
      `🔒 **Closed By:** <@${closedBy.id}>\n` +
      `📁 **Channel:** #${channelObj.name}`
    );

  const transcriptChannel = guildObj.channels.cache.get(TRANSCRIPT_CHANNEL_ID);
  if (transcriptChannel) {
    await transcriptChannel.send({ embeds: [transcriptEmbed], files: [attachment] }).catch(err => console.error('Transcript send error:', err));
  }

  // 2. Direct Message owner with transcript and deal info
  if (data?.user) {
    const dmAttachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), { name: fileName });
    const dmEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setDescription(
        `<a:rizz_tick:1531330187160064030> **Your Exchange Ticket Has Been Closed**\n\n` +
        `Hello ${ticketOwner},\n\n` +
        `Your exchange ticket **#${channelObj.name || 'ticket'}** has been successfully completed and closed.\n\n` +
        `<a:green_button:1531292779999662181> **Deal Overview:**\n` +
        `• **Deal ID:** \`${dealId}\`\n` +
        `• **Exchanger:** ${exchangerUser}\n\n` +
        `Attached is the complete text transcript of your exchange session.\n` +
        `Thank you for using **Cozy Exchange**!`
      );

    try {
      const targetUser = await client.users.fetch(data.user.id);
      if (targetUser) {
        await targetUser.send({ embeds: [dmEmbed], files: [dmAttachment] });
      }
    } catch (dmErr) {
      console.log('Could not send DM to ticket owner:', dmErr);
    }
  }

  // 3. Send Exchange Log to HISTORY_CHANNEL_ID
  const historyEmbed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setDescription(
      `<a:green_button:1531292779999662181> **Exchange Deal Completed**\n\n` +
      `<a:rizz_tick:1531330187160064030> **Deal ID:** \`${dealId}\`\n` +
      `<:bluee_sup:1531339328561610872> **Client:** ${ticketOwner}\n` +
      `<:Exchangeru:1531340808446542056> **Exchanger:** ${exchangerUser}\n` +
      `🕒 **Closed At:** <t:${Math.floor(Date.now() / 1000)}:f>`
    );

  const historyChannel = guildObj.channels.cache.get(HISTORY_CHANNEL_ID);
  if (historyChannel) {
    await historyChannel.send({ embeds: [historyEmbed] }).catch(err => console.error('History send error:', err));
  }

  // Delete channel
  ticketDataMap.delete(channelObj.id);
  await channelObj.delete().catch(err => console.error('Channel delete error:', err));
}

// Global process error catchers to keep bot running 24/7
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
});

// Simple 24/7 keep-alive web server for Render / hosting platforms
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Cozy Ticket Bot is running 24/7!');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Keep-alive web server listening on port ${PORT}`);
});

// Start Discord bot
const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('DISCORD_TOKEN environment variable is missing!');
} else {
  client.login(TOKEN);
  }
