// Import necessary modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Client, GatewayIntentBits, EmbedBuilder, InteractionType } = require('discord.js');
const fetch = require('node-fetch');
const path = require('path');
const session = require('express-session');
const nodemailer = require('nodemailer');

// Load environment variables
dotenv.config();

const redirect_uri = `https://savingshub.cloud/auth/discord/callback`;
const client_id = `1256482400066605086`;

// Hardcoded variables to change
const guild_id = `1214795230537318410`;
const role_id = `1243474841336545303`;
const log_channel = `1257883631368671364`; // Replace with your log channel ID

const app = express();
const port = 8080;

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

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, 
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
        fetch(`http://savingshub.cloud:${port}${route}`).then(res => ({route, status: res.status}))
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

const authenticatedUsers = {};

// Middleware to check if user is authenticated
app.use((req, res, next) => {
  const userId = req.query.userId || req.body.userId;
  if (req.session.user) {
    return res.redirect(`/dashboard.html?userId=${req.session.user.id}`);
  }
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
    req.session.user = userData;

    res.redirect(`/dashboard.html?userId=${userData.id}`);
  } catch (error) {
    console.error('Authentication error:', error);
    res.redirect('/auth-failed.html');
    logError('Authentication error', error);
  }
});

app.get('/api/user', (req, res) => {
  res.json(Object.values(authenticatedUsers));
});

// Endpoint to log out a user
app.post('/api/user/logout', (req, res) => {
  const { userId } = req.body;
  delete authenticatedUsers[userId];
  req.session.destroy();
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



const API_KEY = 'a3bab675-7dbd-4692-9593-3026cf18d5a5'; // Replace with your actual API key

app.use(express.json());

app.post('/send', (req, res) => {
  const { key, ...formData } = req.body;

  // Verify the API key
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Handle the form data and send the email
  sendEmail(formData)
    .then(() => {
      res.json({ message: 'Email sent successfully' });
    })
    .catch((error) => {
      console.error('Error sending email:', error);
      res.status(500).json({ error: 'Error sending email' });
    });
});

function sendEmail(data) {
  return new Promise((resolve, reject) => {
    const transporter = nodemailer.createTransport({
      // Configure your email service details here
      service: 'gmail',
      auth: {
        user: 'abdullahaviator13@gmail.com',
        pass: 'Mississauga9241$'
      }
    });

    const mailOptions = {
      from: 'LegaciesOFMenWebsite@LOM.com',
      to: 'abdullahaviator13@gmail.com',
      subject: data.subject,
      text: `
        First Name: ${data.firstName}
        Last Name: ${data.lastName}
        Email: ${data.email}
        Phone: ${data.phone}
        Gender: ${data.gender}
        Age: ${data.age}
        Username: ${data.username}
        Subject: ${data.subject}
        Message: ${data.message}
        User Info: ${data.userInfo}
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error);
      } else {
        resolve(info);
      }
    });
  });
}
