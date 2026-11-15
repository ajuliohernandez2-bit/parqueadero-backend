// Origenes permitidos: variable CLIENT_URL (varios separados por coma).
// Si no se define, se permite cualquier origen (util en desarrollo).
function origenesPermitidos() {
  return (process.env.CLIENT_URL || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function opcionesCors() {
  const lista = origenesPermitidos();
  if (lista.length === 0) return { origin: true };
  return {
    origin(origin, cb) {
      // Sin cabecera Origin = app movil, Postman o curl: se permite.
      if (!origin || lista.includes(origin)) return cb(null, true);
      return cb(new Error('Origen no permitido por CORS'));
    },
  };
}

module.exports = { origenesPermitidos, opcionesCors };
