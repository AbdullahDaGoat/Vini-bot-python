// src/server/middleware/auth.js
function isAuthenticated(req, res, next) {
  const isApiRequest = req.get('accept').includes('json');

  if (req.session.user) {
    return next();
  }

  if (isApiRequest) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  res.redirect('/auth/discord');
}

module.exports = isAuthenticated;