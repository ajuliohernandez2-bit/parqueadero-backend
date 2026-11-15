const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth.middleware');
const c = require('../controllers/reservas.controller');

router.use(verificarToken);
router.post('/', c.crear);
router.get('/', c.listar);
router.put('/:id/cancelar', c.cancelar);

module.exports = router;
