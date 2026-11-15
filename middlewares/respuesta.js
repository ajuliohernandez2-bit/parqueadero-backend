// Formato unico de respuesta de la API:
//   exito:  { ok: true,  message: 'Texto para el usuario', data: { ... } }
//   error:  { ok: false, message: 'Que fallo',              data: null }
//
// Los controladores siguen respondiendo con res.json({ mensaje, ...datos }) o
// res.status(4xx).json({ error }); este middleware los convierte en un solo
// punto, asi todas las rutas (incluidos el 404, la validacion y el rate limit)
// salen con la misma forma. Los PDF y Excel no pasan por res.json y no se tocan.

function formatearRespuesta(estado, cuerpo) {
  if (estado >= 400) {
    const message = (cuerpo && (cuerpo.error || cuerpo.message)) || 'Ocurrio un error';
    return { ok: false, message, data: null };
  }
  if (Array.isArray(cuerpo) || cuerpo === null || typeof cuerpo !== 'object') {
    return { ok: true, message: 'OK', data: cuerpo ?? null };
  }
  const { mensaje, ...datos } = cuerpo;
  return { ok: true, message: mensaje || 'OK', data: datos };
}

// Una respuesta que ya trae { ok, message, data } se deja tal cual.
const yaFormateada = (c) => c && typeof c === 'object' && typeof c.ok === 'boolean' && 'message' in c && 'data' in c;

function envolverRespuestas(req, res, next) {
  const jsonOriginal = res.json.bind(res);
  res.json = (cuerpo) => jsonOriginal(yaFormateada(cuerpo) ? cuerpo : formatearRespuesta(res.statusCode, cuerpo));
  next();
}

module.exports = { envolverRespuestas, formatearRespuesta };
