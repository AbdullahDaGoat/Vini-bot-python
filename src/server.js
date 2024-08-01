// Import necessary modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');
const cookieSession = require('cookie-session');
const sqlite3 = require('sqlite3').verbose();

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

// Add this line to handle preflight requests
app.options('*', cors());
app.use(express.json());
app.use(express.static('public'));

app.use(cookieSession({
  name: 'session',
  keys: [process.env.SECRET_KEY], // secret keys used to sign the cookie
  maxAge: 1000 * 60 * 15, // 15 minutes
  secure: process.env.NODE_ENV === 'production', // ensure secure cookies in production
  httpOnly: true,
  sameSite: 'lax'
}));

// Initialize SQLite database
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Failed to connect to the database:', err);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT,
      email TEXT,
      avatar TEXT,
      joinedAt TEXT,
      nickname TEXT,
      roles TEXT,
      nitro INTEGER,
      connections TEXT,
      guilds TEXT
    )`);
  }
});

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
    const sampleUser = 1;
    if (sampleUser) {
      const embed = new EmbedBuilder()
        .setTitle('User Parameters')
        .setDescription('Here are the parameters returned by /api/user. Some values are omitted for privacy reasons:')
        .setColor('#00FF00') // Hacker-like green color
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

    // Store user data in SQLite database
    db.run(`INSERT OR REPLACE INTO users (id, username, email, avatar, joinedAt, nickname, roles, nitro, connections, guilds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [user.id, user.username, user.email, user.avatar, user.joinedAt, user.nickname, user.roles, user.nitro, user.connections, user.guilds], 
      (err) => {
      if (err) {
        console.error('Failed to insert user data into the database:', err);
      }
    });

    console.log('User authenticated:', user); // Log user data for debugging
    req.session.user = user;
    console.log('Session set:', req.session.user);
    res.redirect(`/dashboard.html?userId=${user.id}`);
  } catch (error) {
    console.error('OAuth2 callback error:', error);
    res.redirect('/auth-failed.html');
  }
});

// API endpoint to get user information
app.get('/api/user', (req, res) => {
  console.log('Session state on /api/user:', req.session); // Log session state for debugging
  if (req.session?.user) {
    const userId = req.session.user.id;
    console.log('Session user found:', req.session.user);
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) {
        console.error('Failed to retrieve user data from the database:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      if (row) {
        return res.json(row);
      }
      res.status(404).json({ error: 'User not found' });
    });
  } else {
    console.error('Unauthorized access attempt'); // Log unauthorized access attempts
    console.log('Session state:', req.session);
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// Serve static files for the maintenance page
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
});