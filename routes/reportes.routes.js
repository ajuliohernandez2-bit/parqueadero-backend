const express = require('express');
const router = express.Router();
const { verificarToken, permitirRoles, verificarAdmin } = require('../middlewares/auth.middleware');
const c = require('../controllers/reportes.controller');

router.use(verificarToken);
router.get('/estadisticas', permitirRoles('admin', 'operador'), c.estadisticas);
router.get('/ingresos', permitirRoles('admin', 'operador'), c.ingresos);
router.get('/ocupacion', permitirRoles('admin', 'operador'), c.ocupacion);
router.get('/auditoria', verificarAdmin, c.auditoria);

module.exports = router;
