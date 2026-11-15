const express = require('express');
const router = express.Router();
const { verificarToken, verificarAdmin } = require('../middlewares/auth.middleware');
const c = require('../controllers/tarifas.controller');

// Lectura publica (la app movil y el visitante ven cuanto cuesta).
router.get('/', c.listar);
router.get('/estimar', c.estimar); // antes de '/:id'

router.post('/', verificarToken, verificarAdmin, c.crear);
router.put('/:id', verificarToken, verificarAdmin, c.actualizar);
router.delete('/:id', verificarToken, verificarAdmin, c.eliminar);

module.exports = router;
