// Import necessary modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, EmbedBuilder  } = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');


// Load environment variables
dotenv.config();

const redirect_uri = `https://savingshub.cloud/auth/discord/callback`;
const client_id = `1256482400066605086`;
const guild_id = `1256703287550283839`;
const role_id = `1256735791208726630`;
const node_env = `production`;

const app = express();
const port = process.env.PORT || 3000;

// Middleware setup
app.use(cors({
  origin: 'https://savingshub.watch',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Add this line to handle preflight requests
app.options('*', cors());
app.use(express.json());
app.use(express.static('public'));

const session = require('express-session');

app.use(session({
  secret: 'FBD17F49CC4666DFC81BB2334734C',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: true, // set to true if your using https
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Discord client setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', () => {
  console.log('Discord bot is ready!');
  client.user.setPresence({
    status: 'online', // online, idle, dnd, invisible
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
});

client.on('shardError', (error, shardId) => {
  console.error(`WebSocket shard error on shard ${shardId}:`, error);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
  console.error('Failed to log in to Discord:', error);
});

async function handleCommands(message) {
  if (message.content === '!CheckBot') {
    const embed = new EmbedBuilder()
      .setTitle('Bot Status')
      .setDescription('Bot is operational!')
      .setColor('#00FF00');
    message.reply({ embeds: [embed] });
  } else if (message.content === '!API') {
    try {
      // Check all routes
      const routes = ['/api/user', '/auth/discord', '/auth/discord/callback'];
      const results = await Promise.all(routes.map(route => 
        fetch(`http://localhost:${port}${route}`).then(res => ({route, status: res.status}))
      ));
      
      const allOk = results.every(r => r.status === 200);
      const statusText = results.map(r => `${r.route}: ${r.status === 200 ? '✅' : '❌'}`).join('\n');
      
      const embed = new EmbedBuilder()
        .setTitle('API Status')
        .setDescription(allOk ? 'All API routes are working correctly.' : 'There are issues with some API routes.')
        .setColor(allOk ? '#00FF00' : '#FF0000')
        .addFields({ name: 'Route Status', value: statusText });
      
      message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('API check error:', error);
      message.reply('There was an error checking the API status. Please try again later.');
    }
  } else if (message.content === '!Params') {
    const sampleUser = 1;
    if (1 == 1) {
      const embed = new EmbedBuilder()
        .setTitle('User Parameters')
        .setDescription('Here are the parameters returned by /api/user. Some values are ommited for privacy reasons:')
        .setColor('#0099FF')
        .addFields(
          { name: 'User ID', value: "Sample User ID" },
          { name: 'Username', value: "Sample User Name" },
          { name: 'Email', value: "Sample User Email" },
          { name: 'Avatar', value: "Sample User Avatar" },
          { name: 'Joined At', value: "Sample User Joined At" },
          { name: 'Nickname', value: "Sample User Nickname" },
          { name: 'Roles', value: "Sample User Roles" },
          { name: 'Nitro', value: "Sample User Nitro" },
          { name: 'Connections', value: "Sample User Connections" },
          { name: 'Guilds', value: "Sample User Guilds" }
        );
      message.reply({ embeds: [embed] });
    } else {
      message.reply('No authenticated users found. Unable to display parameters.');
    }
  } else if (message.content === '!Help') {
    const embed = new EmbedBuilder()
      .setTitle('Available Commands')
      .setDescription('Here are the available commands:')
      .setColor('#FFA500')
      .addFields(
        { name: '!CheckBot', value: 'Check if the bot is operational' },
        { name: '!API', value: 'Check the status of API routes' },
        { name: '!Params', value: 'Display user parameters from /api/user' },
        { name: '!Help', value: 'Display this help message' }
      );
    message.reply({ embeds: [embed] });
  }
}

client.on('messageCreate', (message) => {
  if (!message.author.bot) {
    handleCommands(message);
  }
});

const authenticatedUsers = {};

// Middleware to check if user is authenticated
app.use((req, res, next) => {
  const userId = req.query.userId || req.body.userId;
  if (req.path === '/api/user') {
    if (userId && authenticatedUsers[userId]) {
      req.user = authenticatedUsers[userId];
    }
    return next();
  }
  if (userId && authenticatedUsers[userId]) {
    return res.redirect(`/dashboard.html?userId=${userId}`);
  }
  next();
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