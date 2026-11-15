const express = require('express');
const router = express.Router();
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');
const {
  registrarEntrada,
  registrarSalida,
  listarActivos,
  ocupacionPorHora,
  historial,
  buscarPorPlaca,
  comprobante,
} = require('../controllers/registros.controller');

router.use(verificarToken);

// Solo el personal (admin / operador) registra movimientos de vehiculos.
router.post('/entrada', permitirRoles('admin', 'operador'), registrarEntrada);
router.put('/:registroId/salida', permitirRoles('admin', 'operador'), registrarSalida);

router.get('/activos', permitirRoles('admin', 'operador'), listarActivos);
router.get('/ocupacion-por-hora', permitirRoles('admin', 'operador'), ocupacionPorHora);

// Historial (el cliente solo ve lo suyo) y busqueda por placa.
router.get('/historial', historial);
router.get('/placa/:placa', permitirRoles('admin', 'operador'), buscarPorPlaca);

router.get('/:registroId/comprobante', comprobante);

module.exports = router;
