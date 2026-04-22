// routes/upload.js
// Maneja subida de imágenes y PDFs para los cuadernos

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();

// Crear carpeta de uploads si no existe
const uploadDir = path.join(__dirname, '../public/assets/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext      = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, safeName);
  }
});

// Validación de tipos permitidos
const allowedMimes = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf'
];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máximo
  fileFilter: (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo imágenes y PDFs.'));
    }
  }
});

// POST /api/upload
// Body: multipart/form-data con campo "file"
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo.' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  const isPdf   = req.file.mimetype === 'application/pdf';

  res.json({
    url:      fileUrl,
    name:     req.file.originalname,
    size:     req.file.size,
    type:     req.file.mimetype,
    isPdf,
  });
});

// DELETE /api/upload/:filename
router.delete('/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // previene path traversal
  const filepath = path.join(uploadDir, filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Archivo no encontrado.' });
  }

  fs.unlinkSync(filepath);
  res.json({ ok: true });
});

// Manejador de errores de multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Error de subida: ${err.message}` });
  }
  res.status(400).json({ error: err.message });
});

module.exports = router;