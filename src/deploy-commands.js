const { REST, Routes } = require('discord.js');
const dotenv = require('dotenv');
dotenv.config();

const CLIENT_ID = `1256482400066605086`;

// Hardcoded variables to change
const GUILD_ID = `1214795230537318410`;

const commands = [
  {
    name: 'checkbot',
    description: 'Check if the bot is operational',
  },
  {
    name: 'api',
    description: 'Check the status of API routes',
  },
  {
    name: 'params',
    description: 'Display user parameters from /api/user',
  },
  {
    name: 'help',
    description: 'Display the available commands',
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
