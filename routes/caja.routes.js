const express = require('express');
const router = express.Router();
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');
const c = require('../controllers/caja.controller');

router.use(verificarToken, permitirRoles('admin', 'operador'));
router.get('/pendiente', c.pendiente);
router.get('/cierres', c.listar);
router.post('/cierres', c.cerrar);

module.exports = router;
