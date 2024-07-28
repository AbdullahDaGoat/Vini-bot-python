require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();
const port = process.env.PORT || 443;
const BASE_URL = `https://${process.env.URL}`;

// Middleware setup
app.use(cors({
  origin: ["https://savingshub.watch", BASE_URL, "https://Savingshub.watch", "http://"],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(cookieParser());

// Discord client setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', () => {
  console.log('Discord bot is ready!');
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: 'SavingsHub Security', type: 'WATCHING' }],
  });
});

async function logError(title, error) {
  const channel = client.channels.cache.get(process.env.LOGGING_CHANNEL_ID);
  if (channel) {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`\`\`\`${error.stack}\`\`\``)
      .setColor('#FF0000')
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  try {
    if (commandName === 'checkbot') {
      const embed = new EmbedBuilder()
        .setTitle('Bot Status')
        .setDescription('Bot is operational!')
        .setColor('#00FF00');
      await interaction.reply({ embeds: [embed] });
    } else if (commandName === 'api') {
      const routes = ['/api/user', '/auth/discord', '/auth/discord/callback'];
      const results = await Promise.all(routes.map(route => 
        fetch(`${BASE_URL}${route}`).then(res => ({ route, status: res.status }))
      ));

      const allOk = results.every(r => r.status === 200);
      const statusText = results.map(r => `${r.route}: ${r.status === 200 ? '✅' : '❌'}`).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('API Status')
        .setDescription(allOk ? 'All API routes are working correctly.' : 'There are issues with some API routes.')
        .setColor(allOk ? '#00FF00' : '#FF0000')
        .addFields({ name: 'Route Status', value: statusText });

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === 'params') {
      await interaction.reply('This command is not available through Discord. Please use the web interface.');
    } else if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('Available Commands')
        .setDescription('Here are the available commands:')
        .setColor('#FFA500')
        .addFields(
          { name: '/checkbot', value: 'Check if the bot is operational' },
          { name: '/api', value: 'Check the status of API routes' },
          { name: '/help', value: 'Display this help message' }
        );
      await interaction.reply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Interaction error:', error);
    await interaction.reply('An error occurred while processing your command.');
    logError('Interaction error', error);
  }
});

async function logUserData(userData) {
  const channel = client.channels.cache.get(process.env.LOGGING);
  if (channel) {
    const embed = new EmbedBuilder()
      .setTitle('User Login Data')
      .setDescription(`\`\`\`json\n${JSON.stringify(userData, null, 2)}\n\`\`\``)
      .setColor('#00FF00')
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
}

app.get('/auth/discord', (req, res) => {
  const token = req.cookies.token;

  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        console.log('Token verification failed:', err);
        return res.redirect('/auth-failed.html');
      }

      res.redirect('/dashboard.html');
    });
  } else {
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join%20email%20connections`;
    res.redirect(authUrl);
  }
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect('/auth-failed.html');
  }

  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.REDIRECT_URI,
        scope: 'identify guilds.join email connections',
      }),
    });

    if (!tokenResponse.ok) throw new Error('Token response failed');

    const tokenData = await tokenResponse.json();
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userResponse.ok) throw new Error('User response failed');

    const userData = await userResponse.json();
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    const member = await guild.members.fetch(userData.id);

    if (!member || !member.roles.cache.has(process.env.ROLE_ID)) {
      return res.redirect('/auth-failed.html');
    }

    const user = {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      avatar: userData.avatar,
      joinedAt: member.joinedAt,
      nickname: member.nickname,
      roles: member.roles.cache.map(role => role.name),
      nitro: userData.premium_type !== undefined,
      guilds: client.guilds.cache.map(guild => ({ id: guild.id, name: guild.name })),
      avatarUrl: `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`,
      discriminator: userData.discriminator,
      locale: userData.locale,
      mfa_enabled: userData.mfa_enabled,
      public_flags: userData.public_flags,
      flags: userData.flags,
      premium_type: userData.premium_type,
      banner: userData.banner,
      accent_color: userData.accent_color,
      bio: userData.bio,
      verified: userData.verified,
      phone: userData.phone,
      connected_accounts: userData.connected_accounts
    };

    // Generate JWT
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '24h' });

    // Store the token in a cookie
    res.cookie('token', token, { httpOnly: true, secure: true, maxAge: 24 * 60 * 60 * 1000 }); // 24 hours
    // Log user data
    await logUserData(user);

    res.redirect('/dashboard.html');
  } catch (error) {
    console.error('OAuth2 callback error:', error);
    res.redirect('/auth-failed.html');
    logError('OAuth2 callback error', error);
  }
});

app.get('/api/user', (req, res) => {
  const user = req.user;

  res.json(user);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error('Failed to log in to Discord:', error);
  logError('Failed to log in to Discord', error);
});