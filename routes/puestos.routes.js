const express = require('express');
const router = express.Router();
const { verificarToken, verificarAdmin } = require('../middlewares/auth.middleware');
const {
  crearPuesto,
  listarPuestos,
  obtenerPuesto,
  actualizarEstadoPuesto,
  actualizarPosicionPuesto,
  eliminarPuesto,
} = require('../controllers/puestos.controller');

// --- Lectura PUBLICA: ver el estado de los puestos no requiere sesion.
router.get('/', listarPuestos);
router.get('/:id', obtenerPuesto);

// --- La estructura y el estado de los puestos solo los administra un admin.
// Las entradas/salidas actualizan el estado desde /registros.
router.post('/', verificarToken, verificarAdmin, crearPuesto);
router.put('/:id/estado', verificarToken, verificarAdmin, actualizarEstadoPuesto);
router.put('/:id/posicion', verificarToken, verificarAdmin, actualizarPosicionPuesto);
router.delete('/:id', verificarToken, verificarAdmin, eliminarPuesto);

module.exports = router;
