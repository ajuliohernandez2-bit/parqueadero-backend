const test = require('node:test');
const assert = require('node:assert');
const Usuario = require('../models/Usuario');
const { registrar } = require('../controllers/auth.controller');

function respuestaFalsa() {
  const r = { codigo: null, cuerpo: null };
  r.status = (c) => { r.codigo = c; return r; };
  r.json = (b) => { r.cuerpo = b; return r; };
  return r;
}

async function registrarConRol(rolPedido) {
  const original = { findOne: Usuario.findOne, save: Usuario.prototype.save };
  Usuario.findOne = async () => null;
  Usuario.prototype.save = async function () { return this; };
  try {
    const res = respuestaFalsa();
    await registrar({ body: { nombre: 'Prueba', email: 'prueba@demo.com', password: 'Demo1234', rol: rolPedido } }, res);
    return res;
  } finally {
    Usuario.findOne = original.findOne;
    Usuario.prototype.save = original.save;
  }
}

for (const rol of [undefined, 'cliente', 'operador', 'admin']) {
  test(`registro publico crea cliente aunque pida rol=${rol}`, async () => {
    const res = await registrarConRol(rol);
    assert.equal(res.codigo, 201);
    assert.equal(res.cuerpo.usuario.rol, 'cliente');
  });
}
