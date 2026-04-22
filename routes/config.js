// routes/config.js
// Endpoint que devuelve la config de Firebase al frontend
// Así las claves viven en .env y no en el código del cliente

const express      = require('express');
const router       = express.Router();
const firebaseConf = require('../config/firebase');

router.get('/', (req, res) => {
  res.json(firebaseConf);
});

module.exports = router;