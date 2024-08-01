// Import necessary modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');
const cookieSession = require('cookie-session');

// Load environment variables
dotenv.config();

const redirect_uri = `https://Savingshub.cloud/auth/discord/callback`;
const client_id = `1256482400066605086`;
const guild_id = `1261067418219057173`;
const role_id = `1261067959393193994`;
const log_channel = `1261070442035286178`;

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
app.use(express.static('public'));

app.use(cookieSession({
  name: 'session',
  keys: [process.env.SECRET_KEY],
  maxAge: 1000 * 60 * 15,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'lax'
}));

// Discord client setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', () => {
  console.log('Discord bot is ready!');
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: 'SavingsHub Security', type: 'WATCHING' }],
  });
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(console.error);

// Authenticated users storage
const authenticatedUsers = {};

// Middleware to check if user is authenticated
app.use((req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (req.session.user || (token && authenticatedUsers[token])) {
    return next();
  }

  res.status(401).json({ error: 'Unauthorized' });
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
    const member = await guild.members.fetch(userData.id);
    const requiredRole = guild.roles.cache.get(role_id);

    if (!member || !requiredRole || !member.roles.cache.has(requiredRole.id)) {
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
      roles: member.roles.cache.map(role => role.name),
      nitro: userData.premium_type !== undefined,
      connections: connections.map(conn => conn.type),
      guilds: client.guilds.cache.map(guild => ({ id: guild.id, name: guild.name })),
    };

    authenticatedUsers[tokenData.access_token] = user; // Store user with the token
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

// Serve static files for the maintenance page
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});