const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const { isAuthenticated } = require('./middleware/auth');

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// Middleware to protect routes that require authentication
app.use('/dashboard', isAuthenticated);

// Serve static files from 'src/client/public'
app.use(express.static(path.join(__dirname, '../client/public')));

app.get('/api/user', (req, res) => {
  if (req.session.user) {
    res.json({ username: req.session.user.username });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.use('/auth', authRoutes);

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/dashboard.html'));
});

module.exports = app;
