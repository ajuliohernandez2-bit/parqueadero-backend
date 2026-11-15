const express = require('express');
const router = express.Router();
const { verificarToken, verificarAdmin } = require('../middlewares/auth.middleware');
const c = require('../controllers/auditoria.controller');

router.use(verificarToken, verificarAdmin);
router.get('/', c.listar);

module.exports = router;
