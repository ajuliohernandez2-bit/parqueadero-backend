const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth.middleware');
const c = require('../controllers/notificaciones.controller');

router.use(verificarToken);
router.get('/', c.listar);
router.put('/leer-todas', c.marcarTodas); // antes de '/:id'
router.put('/:id/leida', c.marcarLeida);

module.exports = router;
