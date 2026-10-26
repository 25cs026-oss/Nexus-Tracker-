const express = require('express');
const path = require('path');
const os = require('os');
const http = require('http');

const app = express();
const PORT = Number(process.env.PORT || 33772);
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.json({ limit: '20mb' }));

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'nexus-tracker',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Resolve the distribution directory (either ./dist from project root, or __dirname if inside dist)
const distPath = path.resolve(__dirname, 'dist');
const finalDist = require('fs').existsSync(distPath) ? distPath : __dirname;

app.use(express.static(finalDist));

// SPA Fallback for client routing
app.get('*', (req, res) => {
  res.sendFile(path.join(finalDist, 'index.html'));
});

const server = app.listen(PORT, HOST, () => {
  console.log(`==================================================`);
  console.log(` Nexus Tracker Live GPS Safety Hub Online`);
  console.log(`==================================================`);
  console.log(` Local:   http://${HOST}:${PORT}`);
  console.log(` Static:  ${finalDist}`);
  console.log(`==================================================`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

module.exports = app;
