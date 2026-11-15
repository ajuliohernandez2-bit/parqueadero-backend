const { z } = require('zod');

const placa = z.string().trim().toUpperCase().regex(
  /^(?:[A-Z]{3}\d{3}|[A-Z]{3}\d{2}[A-Z])$/,
  'La placa debe tener formato colombiano: ABC123 (carro) o ABC12D (moto)'
);

const email = z.string().trim().toLowerCase().email('El correo no es válido');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identificador inválido');
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, 'La fecha debe tener formato AAAA-MM-DD');
const monto = z.coerce.number().finite().nonnegative('El monto debe ser un número mayor o igual a 0');

const reglas = [
  {
    method: 'POST',
    re: /^\/auth\/registrar$/,
    schema: z.object({
      body: z.object({
        nombre: z.string().trim().min(2, 'El nombre es muy corto').max(80),
        email,
        password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres').max(80),
        rol: z.enum(['operador', 'cliente']).optional(),
      }),
    }),
  },
  {
    method: 'POST',
    re: /^\/auth\/login$/,
    schema: z.object({
      body: z.object({
        email,
        password: z.string().min(1, 'La contraseña es obligatoria'),
      }),
    }),
  },
  {
    method: 'POST',
    re: /^\/auth\/firebase$/,
    schema: z.object({
      body: z.object({ idToken: z.string().min(10, 'Falta el idToken de Firebase') }),
    }),
  },
  {
    method: 'POST',
    re: /^\/parqueaderos$/,
    schema: z.object({
      body: z.object({
        nombre: z.string().trim().min(2, 'El nombre del parqueadero es obligatorio'),
        direccion: z.string().trim().max(160).optional(),
        niveles: z.array(z.string().trim().min(1)).optional(),
        tarifaPorMinuto: monto.optional(),
      }),
    }),
  },
  {
    method: 'PUT',
    re: /^\/parqueaderos\/[a-f\d]{24}$/i,
    schema: z.object({
      body: z.object({
        nombre: z.string().trim().min(2).optional(),
        direccion: z.string().trim().max(160).optional(),
        niveles: z.array(z.string()).optional(),
        activo: z.boolean().optional(),
        tarifaPorMinuto: monto.optional(),
      }).refine((b) => Object.keys(b).length > 0, 'No hay cambios para guardar'),
    }),
  },
  {
    method: 'POST',
    re: /^\/puestos$/,
    schema: z.object({
      body: z.object({
        numero: z.string().trim().min(1, 'El número del puesto es obligatorio').max(20),
        parqueaderoId: objectId,
        tipo: z.enum(['carro', 'moto', 'discapacitado', 'bicicleta']).optional(),
        zona: z.enum(['estandar', 'preferencial', 'moto', 'bicicleta']).optional(),
        nivel: z.string().trim().min(1).max(40).optional(),
        posicion: z.object({
          x: z.coerce.number().optional(),
          y: z.coerce.number().optional(),
          ancho: z.coerce.number().optional(),
          alto: z.coerce.number().optional(),
          rotacion: z.coerce.number().optional(),
        }).optional(),
      }),
    }),
  },
  {
    method: 'PUT',
    re: /^\/puestos\/[a-f\d]{24}\/estado$/i,
    schema: z.object({
      body: z.object({ estado: z.enum(['libre', 'ocupado', 'reservado']) }),
    }),
  },
  {
    method: 'PUT',
    re: /^\/puestos\/[a-f\d]{24}\/posicion$/i,
    schema: z.object({
      body: z.object({
        x: z.coerce.number().optional(),
        y: z.coerce.number().optional(),
        ancho: z.coerce.number().optional(),
        alto: z.coerce.number().optional(),
        rotacion: z.coerce.number().optional(),
      }),
    }),
  },
  {
    method: 'POST',
    re: /^\/registros\/entrada$/,
    schema: z.object({
      body: z.object({
        puestoId: objectId,
        placa,
      }),
    }),
  },
  {
    method: 'GET',
    re: /^\/registros\/ocupacion-por-hora$/,
    schema: z.object({
      query: z.object({ parqueaderoId: objectId }),
    }),
  },
  {
    method: 'GET',
    re: /^\/registros\/historial$/,
    schema: z.object({
      query: z.object({
        placa: z.string().trim().max(10).optional(),
        usuarioId: objectId.optional(),
        parqueaderoId: objectId.optional(),
        estado: z.enum(['activo', 'finalizado']).optional(),
        desde: fecha.optional(),
        hasta: fecha.optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    }),
  },
  {
    method: 'PUT',
    re: /^\/usuarios\/[a-f\d]{24}\/rol$/i,
    schema: z.object({
      body: z.object({ rol: z.enum(['admin', 'operador', 'cliente']) }),
    }),
  },
  {
    method: 'PUT',
    re: /^\/usuarios\/[a-f\d]{24}\/estado$/i,
    schema: z.object({
      body: z.object({ activo: z.boolean() }),
    }),
  },
  {
    method: 'POST',
    re: /^\/tarifas$/,
    schema: z.object({
      body: z.object({
        parqueaderoId: objectId,
        tipoVehiculo: z.enum(['carro', 'moto', 'bicicleta']),
        valorHora: monto,
        fraccionMinutos: z.coerce.number().int().min(1).max(24 * 60),
        topeDiario: monto,
      }),
    }),
  },
  {
    method: 'PUT',
    re: /^\/tarifas\/[a-f\d]{24}$/i,
    schema: z.object({
      body: z.object({
        valorHora: monto.optional(),
        fraccionMinutos: z.coerce.number().int().min(1).max(24 * 60).optional(),
        topeDiario: monto.optional(),
      }),
    }),
  },
  {
    method: 'GET',
    re: /^\/tarifas\/estimar$/,
    schema: z.object({
      query: z.object({
        parqueaderoId: objectId,
        tipoVehiculo: z.enum(['carro', 'moto', 'bicicleta']),
        minutos: z.coerce.number().int().min(1).max(24 * 60 * 30),
      }),
    }),
  },
  {
    method: 'POST',
    re: /^\/reservas$/,
    schema: z.object({
      body: z.object({
        puestoId: objectId,
        placa,
        tipoVehiculo: z.enum(['carro', 'moto', 'bicicleta']).optional(),
        inicio: z.string().min(8, 'La fecha de inicio es obligatoria'),
        fin: z.string().min(8, 'La fecha de fin es obligatoria'),
      }),
    }),
  },
  {
    method: 'POST',
    re: /^\/pagos$/,
    schema: z.object({
      body: z.object({
        facturaId: objectId.optional(),
        reservaId: objectId.optional(),
        metodo: z.enum(['efectivo', 'tarjeta', 'transferencia']).optional(),
        monto: monto.optional(),
      }).refine((b) => b.facturaId || b.reservaId, 'Indica una factura o una reserva'),
    }),
  },
  {
    method: 'POST',
    re: /^\/caja\/cierres$/,
    schema: z.object({
      body: z.object({
        parqueaderoId: objectId,
        desde: z.string().min(8),
        hasta: z.string().min(8),
        observaciones: z.string().max(300).optional(),
      }),
    }),
  },
  {
    method: 'GET',
    re: /^\/reportes\/estadisticas$/,
    schema: z.object({ query: z.object({ parqueaderoId: objectId.optional() }) }),
  },
  {
    method: 'GET',
    re: /^\/auditoria$/,
    schema: z.object({
      query: z.object({
        parqueaderoId: objectId.optional(),
        accion: z.string().trim().max(40).optional(),
        desde: fecha.optional(),
        hasta: fecha.optional(),
        page: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
    }),
  },
  {
    method: 'GET',
    re: /^\/caja\/pendiente$/,
    schema: z.object({ query: z.object({ parqueaderoId: objectId }) }),
  },
  {
    method: 'GET',
    re: /^\/reportes\/(ingresos|ocupacion|auditoria)$/,
    schema: z.object({
      query: z.object({
        formato: z.enum(['xlsx', 'pdf']).optional(),
        accion: z.string().trim().max(40).optional(),
        parqueaderoId: objectId.optional(),
        desde: fecha.optional(),
        hasta: fecha.optional(),
      }),
    }),
  },
];

function validarEntradas(req, res, next) {
  const regla = reglas.find((r) => r.method === req.method && r.re.test(req.path));
  if (!regla) return next();

  const parsed = regla.schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({ error: issue?.message || 'Datos inválidos' });
  }
  if (parsed.data.body) req.body = parsed.data.body;
  if (parsed.data.query) req.query = parsed.data.query;
  next();
}

module.exports = { validarEntradas, placa, email, objectId, monto };
