// src/index.js

require('dotenv').config();
const app = require('./server/server');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});