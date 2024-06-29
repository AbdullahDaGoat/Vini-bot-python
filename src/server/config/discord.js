require('dotenv').config();

module.exports = {
  CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  REDIRECT_URI: process.env.DISCORD_REDIRECT_URI
};