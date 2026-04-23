// server.js — Servidor Express principal
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const configRoute  = require('./routes/config');
const uploadRoute  = require('./routes/upload');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Seguridad ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'", "'unsafe-inline'", "https://www.gstatic.com", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr:   ["'unsafe-inline'"],   // ← permite onclick, onchange en el HTML
      styleSrc:        ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc:         ["'self'", "https://fonts.gstatic.com"],
      imgSrc:          ["'self'", "data:", "https:", "blob:"],
      connectSrc:      ["'self'", "https://*.firebaseio.com", "https://*.googleapis.com", "wss://*.firebaseio.com"],
      workerSrc:       ["'self'", "blob:"],
    }
  }
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — protege contra abuso
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  message: 'Demasiadas peticiones, intenta en 15 minutos.'
});
app.use(limiter);

// Subidas: rate limit más estricto
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Límite de subidas alcanzado.'
});
app.use('/api/upload', uploadLimiter);

// ── Archivos estáticos ───────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
// Sirve las imágenes subidas
app.use('/uploads', express.static(path.join(__dirname, 'public/assets/uploads')));

// ── Rutas API ────────────────────────────────────────────────
app.use('/api/config',  configRoute);
app.use('/api/upload',  uploadRoute);

// ── SPA: todas las rutas devuelven index.html ────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error handler global ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}\n`);
});