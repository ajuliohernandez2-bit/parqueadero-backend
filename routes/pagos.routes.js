const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth.middleware');
const c = require('../controllers/pagos.controller');

router.use(verificarToken);
router.post('/', c.registrar);
router.get('/', c.listar);

module.exports = router;
