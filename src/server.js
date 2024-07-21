require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');
const cookieSession = require('cookie-session');

const app = express();
const port = process.env.PORT || 443; 

// Middleware setup
app.use(cors({
  origin: 'https://savingshub.watch',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from public folder

app.use(cookieSession({
  name: 'session',
  keys: [process.env.SECRET_KEY], // secret keys used to sign the cookie
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax'
}));

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

// Log errors to Discord channel
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

// Discord Commands Handling
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'checkbot') {
    const embed = new EmbedBuilder()
      .setTitle('Bot Status')
      .setDescription('Bot is operational!')
      .setColor('#00FF00');
    await interaction.reply({ embeds: [embed] });
  } else if (commandName === 'api') {
    try {
      const routes = ['/api/user', '/auth/discord', '/auth/discord/callback'];
      const results = await Promise.all(routes.map(route => 
        fetch(`https://savingshub.cloud:${port}${route}`).then(res => ({ route, status: res.status }))
      ));

      const allOk = results.every(r => r.status === 200);
      const statusText = results.map(r => `${r.route}: ${r.status === 200 ? '✅' : '❌'}`).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('API Status')
        .setDescription(allOk ? 'All API routes are working correctly.' : 'There are issues with some API routes.')
        .setColor(allOk ? '#00FF00' : '#FF0000')
        .addFields({ name: 'Route Status', value: statusText });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('API check error:', error);
      await interaction.reply('There was an error checking the API status. Please try again later.');
      logError('API check error', error);
    }
  } else if (commandName === 'params') {
    const embed = new EmbedBuilder()
      .setTitle('User Parameters')
      .setDescription('Here are the parameters returned by /api/user:')
      .setColor('#00FF00')
      .addFields(
        { name: 'User ID', value: 'Sample User ID' },
        { name: 'Username', value: 'Sample User Name' },
        { name: 'Email', value: 'Sample User Email' },
        { name: 'Avatar', value: 'Sample User Avatar' },
        { name: 'Joined At', value: 'Sample User Joined At' },
        { name: 'Nickname', value: 'Sample User Nickname' },
        { name: 'Roles', value: 'Sample User Roles' },
        { name: 'Nitro', value: 'Sample User Nitro' },
        { name: 'Connections', value: 'Sample User Connections' },
        { name: 'Guilds', value: 'Sample User Guilds' }
      );
    await interaction.reply({ embeds: [embed] });
  } else if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('Available Commands')
      .setDescription('Here are the available commands:')
      .setColor('#FFA500')
      .addFields(
        { name: '/checkbot', value: 'Check if the bot is operational' },
        { name: '/api', value: 'Check the status of API routes' },
        { name: '/params', value: 'Display user parameters from /api/user' },
        { name: '/help', value: 'Display this help message' }
      );
    await interaction.reply({ embeds: [embed] });
  }
});

// OAuth2 authentication endpoint
app.get('/auth/discord', (req, res) => {
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join%20email%20connections`;
  res.redirect(authUrl);
});

// OAuth2 callback endpoint
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

    const tokenData = await tokenResponse.json();
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

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
    };

    req.session.user = user;

    res.redirect(`/dashboard.html?userId=${user.id}`);
  } catch (error) {
    console.error('OAuth2 callback error:', error);
    res.redirect('/auth-failed.html');
  }
});

// API endpoint to get user information
app.get('/api/user', (req, res) => {
  if (req.session.user) {
    return res.json(req.session.user);
  }
  res.status(401).json({ error: 'Unauthorized' });
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});

// Discord bot login
client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error('Failed to log in to Discord:', error);
  logError('Failed to log in to Discord', error);
});