const express = require('express');
const axios = require('axios');
const router = express.Router();
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = require('../config/discord');

router.get('/discord', (req, res) => {
  const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20email`;
  res.redirect(authorizeUrl);
});

router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        scope: 'identify email',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, token_type } = tokenResponse.data;

    // Use the access token to get the user's information
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: {
        authorization: `${token_type} ${access_token}`,
      },
    });

    const userData = userResponse.data;

    // Store user data in session
    req.session.user = {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      avatar: userData.avatar,
    };

    // Redirect to dashboard or homepage
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Error during Discord authentication:', error);
    res.status(500).send('Authentication failed');
  }
});


module.exports = router;