require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');

const { connectDB } = require('./config/db');
const { initSocket } = require('./config/socket');
const { opcionesCors } = require('./config/cors');
const { datosEstado, paginaEstadoHTML } = require('./config/paginaEstado');
const { validarEntradas } = require('./middlewares/validar');
const { envolverRespuestas } = require('./middlewares/respuesta');
const { noEncontrado, manejadorErrores } = require('./middlewares/error.middleware');
const { iniciarCronReservas } = require('./services/reservasCron');

const PORT = process.env.PORT || 3000;
const produccion = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET) {
  console.error('❌ Falta JWT_SECRET en el .env (copia .env.example a .env y cambia el valor).');
  process.exit(1);
}
if (/cambia_esto/i.test(process.env.JWT_SECRET)) {
  console.warn('⚠️  JWT_SECRET sigue con el valor de ejemplo. Cambialo por un secreto largo y aleatorio.');
  if (produccion) process.exit(1);
}

const app = express();
const servidorHttp = http.createServer(app);
initSocket(servidorHttp);

// Detras de Render / Railway / Vercel hay un proxy: necesario para el rate limit por IP.
if (produccion) app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(opcionesCors()));
app.use(express.json({ limit: '100kb' }));
// Debe ir antes de los limitadores y las rutas: da el formato { ok, message, data } a todo.
app.use(envolverRespuestas);

const limiteGeneral = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta de nuevo en un minuto.' },
});
const limiteAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT) || 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de acceso. Espera 15 minutos e intenta de nuevo.' },
});
app.use(limiteGeneral);
app.use('/auth', limiteAuth);

// Valida body/query de las rutas definidas en middlewares/validar.js (zod).
app.use(validarEntradas);

app.get('/', (req, res) => {
  const quiereHTML = req.accepts(['json', 'html']) === 'html' && req.query.formato !== 'json';
  if (quiereHTML) return res.send(paginaEstadoHTML(PORT));
  res.json(datosEstado());
});

app.get('/salud', (req, res) => res.json({ ok: true, message: 'Servidor en línea', data: { hora: new Date().toISOString() } }));

app.use('/auth', require('./routes/auth.routes'));
app.use('/parqueaderos', require('./routes/parqueaderos.routes'));
app.use('/puestos', require('./routes/puestos.routes'));
app.use('/registros', require('./routes/registros.routes'));
app.use('/usuarios', require('./routes/usuarios.routes'));
app.use('/tarifas', require('./routes/tarifas.routes'));
app.use('/reservas', require('./routes/reservas.routes'));
app.use('/pagos', require('./routes/pagos.routes'));
app.use('/notificaciones', require('./routes/notificaciones.routes'));
app.use('/caja', require('./routes/caja.routes'));
app.use('/reportes', require('./routes/reportes.routes'));
app.use('/auditoria', require('./routes/auditoria.routes'));

app.use(noEncontrado);
app.use(manejadorErrores);

async function iniciarServidor() {
  await connectDB();
  servidorHttp.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
  iniciarCronReservas();
}

if (require.main === module) iniciarServidor();

module.exports = { app, servidorHttp };
