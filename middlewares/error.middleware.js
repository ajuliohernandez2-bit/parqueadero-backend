function noEncontrado(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// Manejador central: traduce errores conocidos (Mongoose, JSON, CORS) a
// respuestas claras y nunca filtra detalles internos en errores 500.
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  let estado = err.status || err.statusCode || 500;
  let mensaje = err.message || 'Error interno del servidor';

  if (err.name === 'CastError') {
    estado = 400;
    mensaje = 'Identificador inválido';
  } else if (err.name === 'ValidationError') {
    estado = 400;
    mensaje = Object.values(err.errors || {})[0]?.message || 'Datos inválidos';
  } else if (err.code === 11000) {
    estado = 409;
    mensaje = 'Ya existe un registro con esos datos';
  } else if (err.type === 'entity.parse.failed') {
    estado = 400;
    mensaje = 'El cuerpo de la peticion no es un JSON valido';
  } else if (err.message === 'Origen no permitido por CORS') {
    estado = 403;
  }

  if (estado >= 500) {
    console.error(err);
    mensaje = 'Error interno del servidor';
  }
  res.status(estado).json({ error: mensaje });
}

module.exports = { noEncontrado, manejadorErrores };
