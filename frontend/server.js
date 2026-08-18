const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = parseInt(process.env.PORT || '8080', 10);
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:5000';

const app = express();

app.use(
  '/api',
  createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    logLevel: 'warn',
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[frontend] escuchando en :${PORT} -> proxy /api -> ${BACKEND_URL}`);
});
