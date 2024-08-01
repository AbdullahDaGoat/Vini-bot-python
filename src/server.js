// Import necessary modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

const redirect_uri = process.env.REDIRECT_URI;
const client_id = process.env.DISCORD_CLIENT_ID;

// Hardcoded variables to change
const guild_id = process.env.GUILD_ID;
const role_id = process.env.ROLE_ID;
const log_channel = process.env.LOGGING_CHANNEL_ID;

const app = express();
const port = process.env.PORT || 443;

// Middleware setup
app.use(cors({
  origin: ['https://savingshub.watch', 'https://savingshub.cloud'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());
app.use(express.json());
app.use(express.static('public'));

// Local storage for users
let users = {};

// Read users from file if it exists
const usersFilePath = './users.json';
if (fs.existsSync(usersFilePath)) {
  users = JSON.parse(fs.readFileSync(usersFilePath));
}

// Function to save users to file
const saveUsersToFile = () => {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
};

// Discord client setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', () => {
  console.log('Discord bot is ready!');
  client.user.setPresence({
    status: 'dnd', // online, idle, dnd, invisible
    activities: [
      {
        name: 'SavingsHub Security', // Set the bot's activity name
        type: 'WATCHING', // PLAYING, STREAMING, LISTENING, WATCHING
      },
    ],
  });
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
  logError('Discord client error', error);
});

client.on('shardError', (error, shardId) => {
  console.error(`WebSocket shard error on shard ${shardId}:`, error);
  logError(`WebSocket shard error on shard ${shardId}`, error);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error('Failed to log in to Discord:', error);
  logError('Failed to log in to Discord', error);
});

async function logError(title, error) {
  const channel = client.channels.cache.get(log_channel);
  if (channel) {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`\`\`\`${error.stack}\`\`\``)
      .setColor('#FF0000')
      .setTimestamp();
    channel.send({ embeds: [embed] });
  } else {
    console.error('Log channel not found:', log_channel);
  }
}

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
      // Check all routes
      const routes = ['/api/user', '/auth/discord', '/auth/discord/callback'];
      const results = await Promise.all(routes.map(route => 
        fetch(`https://savingshub.cloud:${port}${route}`).then(res => ({route, status: res.status}))
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
    const sampleUser = Object.values(users)[0];
    if (sampleUser) {
      const embed = new EmbedBuilder()
        .setTitle('User Parameters')
        .setDescription('Here are the parameters returned by /api/user. Some values are omitted for privacy reasons:')
        .setColor('#00FF00') // Hacker-like green color
        .addFields(
          { name: 'User ID', value: sampleUser.id },
          { name: 'Username', value: sampleUser.username },
          { name: 'Email', value: sampleUser.email },
          { name: 'Avatar', value: sampleUser.avatar },
          { name: 'Joined At', value: sampleUser.joinedAt },
          { name: 'Nickname', value: sampleUser.nickname },
          { name: 'Roles', value: sampleUser.roles },
          { name: 'Nitro', value: sampleUser.nitro.toString() },
          { name: 'Connections', value: sampleUser.connections },
          { name: 'Guilds', value: sampleUser.guilds }
        );
      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply('No authenticated users found. Unable to display parameters.');
    }
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
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=identify%20guilds.join%20email%20connections`;
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
        client_id: client_id,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirect_uri,
        scope: 'identify guilds.join email connections',
      }),
    });

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userData = await userResponse.json();

    const guild = client.guilds.cache.get(guild_id);
    if (!guild) {
      return res.redirect('/auth-failed.html');
    }

    const member = await guild.members.fetch(userData.id);
    if (!member) {
      return res.redirect('/auth-failed.html');
    }

    const requiredRole = guild.roles.cache.get(role_id);
    if (!requiredRole || !member.roles.cache.has(requiredRole.id)) {
      return res.redirect('/auth-failed.html');
    }

    const connectionsResponse = await fetch('https://discord.com/api/users/@me/connections', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const connections = await connectionsResponse.json();

    const user = {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      avatar: userData.avatar,
      joinedAt: member.joinedAt,
      nickname: member.nickname,
      roles: member.roles.cache.map(role => role.name).join(','),
      nitro: userData.premium_type !== undefined ? 1 : 0,
      connections: connections.map(conn => conn.type).join(','),
      guilds: client.guilds.cache.map(guild => ({ id: guild.id, name: guild.name })).map(g => `${g.id}:${g.name}`).join(',')
    };

    // Store user data locally
    users[user.id] = { ...user, token: tokenData.access_token };
    saveUsersToFile();

    console.log('User authenticated:', user); // Log user data for debugging
    res.redirect(`/dashboard.html`);
  }
  catch (error) {
    console.error('OAuth2 callback error:', error);
    res.redirect('/auth-failed.html');
  }
});

// API endpoint to get user information
app.get('/api/user', (req, res) => {
  const origin = req.get('origin');
  const allowedOrigins = ['https://savingshub.watch', 'https://savingshub.cloud'];

  if (allowedOrigins.includes(origin) || req.get('host').includes('savingshub.cloud')) {
    const authHeader = req.get('Authorization');
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      const user = Object.values(users).find(u => u.token === token);
      if (user) {
        return res.json(user);
      }
    }
    res.status(401).json({ error: 'Unauthorized' });
  } else {
    console.error('Unauthorized access attempt'); // Log unauthorized access attempts
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// Serve static files for the maintenance page
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});
