// Import necessary modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');

// Load environment variables
dotenv.config();

const redirect_uri = `http://localhost:3000/auth/discord/callback`;
const client_id = `1256482400066605086`;
const guild_id = `1256703287550283839`;
const role_id = `1256735791208726630`;
const node_env = `production`;

const app = express();
const port = process.env.PORT || 3000;

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Discord client setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', () => {
  console.log('Discord bot is ready!');
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

client.on('shardError', (error, shardId) => {
  console.error(`WebSocket shard error on shard ${shardId}:`, error);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error('Failed to log in to Discord:', error);
});

// Handle !test command
client.on('messageCreate', (message) => {
  if (message.content === '!test') {
    try {
      message.reply('Bot is operational!');
    } catch (error) {
      console.error('Test command error:', error);
      message.reply('Bot encountered an error.');
    }
  }
});

const authenticatedUsers = {};

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

    const connectionsData = await connectionsResponse.json();

    const userGuildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userGuildsData = await userGuildsResponse.json();

    userData.avatarPng = `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`;
    userData.joinedTimestamp = member.joinedTimestamp;
    userData.nickname = member.nickname;
    userData.roles = member.roles.cache.map(role => role.name).join(', ');
    userData.connections = connectionsData;
    userData.guilds = userGuildsData;
    userData.nitro = userData.premium_type ? 'Yes' : 'No';

    authenticatedUsers[userData.id] = userData;

    res.redirect(`/dashboard.html?userId=${userData.id}`);
  } catch (error) {
    console.error('Authentication error:', error);
    res.redirect('/auth-failed.html');
  }
});

// Endpoint to get all authenticated users' data
app.get('/api/user', (req, res) => {
  res.json(Object.values(authenticatedUsers));
});

// Endpoint to log out a user
app.post('/api/user/logout', (req, res) => {
  const { userId } = req.body;
  delete authenticatedUsers[userId];
  res.json({ success: true });
});

// Serve static files
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`Auth server is running on port ${port}`);
});
