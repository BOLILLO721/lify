/**
 * Utilidades de base de datos.
 *
 *   node scripts/db.js sync          Crea colecciones e índices que falten.
 *   node scripts/db.js reset --yes   BORRA toda la base y la deja recreada y vacía.
 */
const mongoose = require('mongoose');
const config = require('../config');
const { ensureSchema } = require('../db/connection');

const [command, flag] = process.argv.slice(2);

const run = async () => {
  if (!['sync', 'reset'].includes(command)) {
    console.log('Uso: node scripts/db.js <sync | reset --yes>');
    process.exit(1);
  }

  if (command === 'reset' && flag !== '--yes') {
    console.error('reset borra TODA la base de datos. Repite con --yes para confirmar.');
    process.exit(1);
  }

  if (!config.mongo.uri) {
    console.error('Falta MONGODB_URI en el .env');
    process.exit(1);
  }

  await mongoose.connect(config.mongo.uri, { dbName: config.mongo.dbName });
  console.log(`Base de datos: ${mongoose.connection.name}`);

  if (command === 'reset') {
    await mongoose.connection.dropDatabase();
    console.log('Base de datos borrada.');
  }

  await ensureSchema();
  console.log('Colecciones e índices listos.');
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
