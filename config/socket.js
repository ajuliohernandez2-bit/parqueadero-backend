const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { opcionesCors } = require('./cors');

let io;

// El plano en vivo es publico (cualquiera se conecta). Si el cliente manda
// `auth: { token }` con un JWT valido, ademas entra a su sala privada
// `usuario:<id>` (notificaciones) y, si es staff, a la sala `staff`.
function initSocket(servidorHttp) {
  io = new Server(servidorHttp, { cors: opcionesCors() });

  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        socket.join(`usuario:${payload.id}`);
        if (payload.rol === 'admin' || payload.rol === 'operador') socket.join('staff');
        socket.data.usuario = payload;
      } catch (error) {
        // token invalido o vencido: queda como visitante
      }
    }

    socket.on('disconnect', () => {});
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io no ha sido inicializado todavia');
  }
  return io;
}

module.exports = { initSocket, getIO };
