import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { sequelize, connectDB } from '../configs/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPTS_DIR = path.join(__dirname, 'pg_scripts');

if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

const ensureMigrationsTable = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS _pg_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      batch INTEGER NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

const getMigrationFiles = () => {
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort();
};

export const getPgStatus = async () => {
  await connectDB();
  await ensureMigrationsTable();

  const [appliedRecords] = await sequelize.query(
    'SELECT name, batch, applied_at FROM _pg_migrations ORDER BY name ASC;'
  );
  const appliedMap = new Map(appliedRecords.map((r) => [r.name, r]));
  const allFiles = getMigrationFiles();

  console.log('\n========= POSTGRESQL MIGRATION PIPELINE STATUS =========');
  console.log(`Database: PostgreSQL | Total Files: ${allFiles.length}`);
  console.log('--------------------------------------------------------');

  for (const file of allFiles) {
    const record = appliedMap.get(file);
    if (record) {
      const dateStr = new Date(record.applied_at)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);
      console.log(` ✅ [APPLIED]  Batch #${record.batch} (${dateStr})  ${file}`);
    } else {
      console.log(` ⏳ [PENDING]  Not applied yet                 ${file}`);
    }
  }
  console.log('========================================================\n');

  return {
    total: allFiles.length,
    applied: appliedRecords.length,
    pending: allFiles.length - appliedRecords.length,
  };
};

export const runPgUp = async () => {
  await connectDB();
  await ensureMigrationsTable();

  const [appliedRecords] = await sequelize.query(
    'SELECT name FROM _pg_migrations;'
  );
  const appliedSet = new Set(appliedRecords.map((r) => r.name));
  const allFiles = getMigrationFiles();
  const pendingFiles = allFiles.filter((f) => !appliedSet.has(f));

  if (pendingFiles.length === 0) {
    console.log('✨ No pending PostgreSQL migrations. Database is up to date!');
    return;
  }

  const [latestBatchResult] = await sequelize.query(
    'SELECT MAX(batch) as max_batch FROM _pg_migrations;'
  );
  const nextBatch = (latestBatchResult[0]?.max_batch || 0) + 1;

  console.log(`\n🚀 Starting PostgreSQL Migration Pipeline [Batch #${nextBatch}]...`);

  for (const file of pendingFiles) {
    console.log(`▶ Applying PostgreSQL migration: ${file}...`);
    const scriptPath = path.join(SCRIPTS_DIR, file);
    const scriptUrl = pathToFileURL(scriptPath).href;

    try {
      const migrationModule = await import(scriptUrl);
      if (typeof migrationModule.up === 'function') {
        await migrationModule.up({ sequelize });
      }

      await sequelize.query(
        'INSERT INTO _pg_migrations (name, batch) VALUES ($1, $2);',
        { bind: [file, nextBatch] }
      );
      console.log(`   ✔ Successfully applied ${file}`);
    } catch (err) {
      console.error(`\n❌ Migration failed on ${file}:`, err.message);
      throw err;
    }
  }

  console.log(`\n✨ Successfully applied ${pendingFiles.length} PostgreSQL migration(s).\n`);
};

export const runPgDown = async () => {
  await connectDB();
  await ensureMigrationsTable();

  const [latestBatchResult] = await sequelize.query(
    'SELECT MAX(batch) as max_batch FROM _pg_migrations;'
  );
  const targetBatch = latestBatchResult[0]?.max_batch;

  if (!targetBatch) {
    console.log('✨ No PostgreSQL migrations to roll back.');
    return;
  }

  const [batchRecords] = await sequelize.query(
    'SELECT name FROM _pg_migrations WHERE batch = $1 ORDER BY id DESC;',
    { bind: [targetBatch] }
  );

  console.log(`\n⏪ Rolling back PostgreSQL Batch #${targetBatch}...`);

  for (const record of batchRecords) {
    const scriptPath = path.join(SCRIPTS_DIR, record.name);
    const scriptUrl = pathToFileURL(scriptPath).href;

    try {
      const migrationModule = await import(scriptUrl);
      if (typeof migrationModule.down === 'function') {
        await migrationModule.down({ sequelize });
      }

      await sequelize.query('DELETE FROM _pg_migrations WHERE name = $1;', {
        bind: [record.name],
      });
      console.log(`   ✔ Reverted ${record.name}`);
    } catch (err) {
      console.error(`\n❌ Rollback failed on ${record.name}:`, err.message);
      throw err;
    }
  }
};

const main = async () => {
  const command = process.argv[2] || 'status';

  try {
    if (command === 'status') {
      await getPgStatus();
    } else if (command === 'up') {
      await runPgUp();
    } else if (command === 'down') {
      await runPgDown();
    } else {
      console.log(`Unknown command '${command}'. Available commands: up, down, status`);
    }
  } catch (err) {
    console.warn('[PostgreSQL Migration Notice]:', err.message);
  } finally {
    if (sequelize) {
      await sequelize.close().catch(() => {});
    }
    process.exit(0);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
