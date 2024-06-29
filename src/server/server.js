// src/server/server.js

const express = require('express');
const session = require('express-session');
const path = require('path');
const authRoutes = require('./routes/auth');
const  isAuthenticated  = require('./middleware/auth');

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.use(express.static(path.join(__dirname, '../client/public')));

// Middleware to protect API endpoints that require authentication
app.use('/api/user', isAuthenticated);

// API endpoint to fetch user data
app.get('/api/user', (req, res) => {
  if (req.session.user) {
    // Return all user data stored in session
    res.json(req.session.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.use('/auth', authRoutes);

// Serve dashboard.html for authenticated users
app.get('/dashboard', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/dashboard.html'));
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

module.exports = app;
