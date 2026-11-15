// Envuelve un controlador async para que cualquier error llegue al
// manejador central de errores (middlewares/error.middleware.js).
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
