import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import mongoose from 'mongoose';
import { connectMongoDB, disconnectMongoDB } from '../configs/mongodb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_DIR = path.resolve(__dirname, '../models');

/**
 * Dynamically registers all Mongoose models in src/models
 */
export const loadAllMongooseModels = async () => {
  if (!fs.existsSync(MODELS_DIR)) return;
  const files = fs
    .readdirSync(MODELS_DIR)
    .filter((f) => f.includes('.mongo.model.js') || f.endsWith('.model.js'));

  for (const file of files) {
    const fullPath = path.join(MODELS_DIR, file);
    try {
      await import(pathToFileURL(fullPath).href);
    } catch {
      // Ignore models that fail or are Sequelize only
    }
  }
};

/**
 * Normalizes index key specifications into a deterministic string for comparison.
 *
 * @param {object} keyObj Index key object (e.g. { status: 1, nextRetryAt: 1 })
 * @returns {string} Normalized key string
 */
export const normalizeIndexKey = (keyObj) => {
  if (!keyObj || typeof keyObj !== 'object') return '';
  const entries = Object.entries(keyObj).sort(([k1], [k2]) => k1.localeCompare(k2));
  return JSON.stringify(entries);
};

/**
 * Performs a comprehensive, non-destructive pre-deployment review of MongoDB indexes.
 *
 * Compares Mongoose schemas against live database collection indexes to:
 * 1. Identify verified in-sync indexes
 * 2. Flag missing indexes that require migration before deployment
 * 3. Flag extraneous indexes present in DB but absent from Mongoose schemas
 *    (HIGH RISK: would be deleted by model.syncIndexes())
 *
 * @param {object} [options]
 * @param {boolean} [options.silent=false] Suppress console output (useful for tests)
 * @param {object} [options.db] Mock or explicit MongoDB Db instance
 * @returns {Promise<object>} Detailed audit report
 */
export const reviewIndexes = async (options = {}) => {
  const { silent = false } = options;

  await loadAllMongooseModels();

  let db = options.db;
  if (!db && mongoose.connection.readyState === 1) {
    db = mongoose.connection.db;
  }

  const report = {
    timestamp: new Date().toISOString(),
    database: db ? db.databaseName : 'disconnected',
    modelsAnalyzed: 0,
    totalSchemaIndexes: 0,
    totalDbIndexes: 0,
    inSyncCount: 0,
    missingCount: 0,
    extraneousCount: 0,
    collections: [],
    criticalWarnings: [],
    recommendations: [],
  };

  const models = Object.values(mongoose.models);
  report.modelsAnalyzed = models.length;

  if (!silent) {
    console.log('\n================================================================================');
    console.log('             MONGODB INDEX PRE-DEPLOYMENT ARCHITECTURAL REVIEW');
    console.log('================================================================================');
    console.log(`Database: ${report.database} | Total Registered Models: ${models.length}`);
    console.log('Mode: READ-ONLY AUDIT (Zero destructive writes or index drops)\n');
  }

  for (const model of models) {
    const collName = model.collection ? model.collection.name : model.modelName.toLowerCase();
    const schemaIndexes = typeof model.schema?.indexes === 'function' ? model.schema.indexes() : [];
    
    // Parse schema index specs
    const schemaIndexList = schemaIndexes.map(([keys, opts]) => {
      const name = opts?.name || Object.entries(keys).map(([k, v]) => `${k}_${v}`).join('_');
      return {
        name,
        keys,
        unique: Boolean(opts?.unique),
        normalizedKey: normalizeIndexKey(keys),
      };
    });

    let liveDbIndexes = [];
    if (db && typeof db.collection === 'function') {
      try {
        const coll = db.collection(collName);
        liveDbIndexes = await coll.indexes();
      } catch (err) {
        liveDbIndexes = [];
      }
    }

    const collEntry = {
      modelName: model.modelName,
      collectionName: collName,
      schemaIndexes: schemaIndexList.length,
      liveIndexes: liveDbIndexes.length,
      inSync: [],
      missingInDb: [],
      extraneousInDb: [],
    };

    report.totalSchemaIndexes += schemaIndexList.length;
    report.totalDbIndexes += liveDbIndexes.length;

    // Map live DB indexes
    const liveMap = new Map();
    for (const live of liveDbIndexes) {
      if (live.name === '_id_') continue; // Built-in default
      const norm = normalizeIndexKey(live.key);
      liveMap.set(norm, live);
    }

    // Identify In-Sync vs Missing
    for (const schemaIdx of schemaIndexList) {
      if (liveMap.has(schemaIdx.normalizedKey)) {
        collEntry.inSync.push(schemaIdx.name);
        liveMap.delete(schemaIdx.normalizedKey); // matched
      } else {
        collEntry.missingInDb.push({
          name: schemaIdx.name,
          keys: schemaIdx.keys,
          unique: schemaIdx.unique,
        });
      }
    }

    // Any remaining indexes in liveMap are extraneous (present in DB, absent in schema)
    for (const extraneous of liveMap.values()) {
      collEntry.extraneousInDb.push({
        name: extraneous.name,
        keys: extraneous.key,
        unique: Boolean(extraneous.unique),
      });
    }

    report.inSyncCount += collEntry.inSync.length;
    report.missingCount += collEntry.missingInDb.length;
    report.extraneousCount += collEntry.extraneousInDb.length;
    report.collections.push(collEntry);

    if (collEntry.extraneousInDb.length > 0) {
      report.criticalWarnings.push(
        `Collection '${collName}' has ${collEntry.extraneousInDb.length} index(es) that model.syncIndexes() would permanently delete.`
      );
    }

    if (!silent) {
      console.log(`Model: ${model.modelName} (Collection: ${collName})`);
      console.log(`  Schema Defined: ${schemaIndexList.length} | Live in DB: ${liveDbIndexes.length}`);
      
      if (collEntry.inSync.length > 0) {
        console.log(`  ✅ In Sync (${collEntry.inSync.length}): ${collEntry.inSync.join(', ')}`);
      }
      if (collEntry.missingInDb.length > 0) {
        console.log(`  ⏳ Missing in DB (${collEntry.missingInDb.length}):`);
        collEntry.missingInDb.forEach((idx) => {
          console.log(`     - ${idx.name}: ${JSON.stringify(idx.keys)}`);
        });
      }
      if (collEntry.extraneousInDb.length > 0) {
        console.log(`  🚨 EXTRANEOUS IN DB (${collEntry.extraneousInDb.length}) [RISK: DROPPED BY syncIndexes]:`);
        collEntry.extraneousInDb.forEach((idx) => {
          console.log(`     - ${idx.name}: ${JSON.stringify(idx.keys)}`);
        });
      }
      console.log('--------------------------------------------------------------------------------');
    }
  }

  // Compile recommendations
  if (report.extraneousCount > 0) {
    report.recommendations.push(
      'CRITICAL: Extraneous indexes exist in the live database. Running automatic model.syncIndexes() will permanently drop them. Keep automatic index drops disabled in production.'
    );
  }
  if (report.missingCount > 0) {
    report.recommendations.push(
      `Apply explicit migrations for ${report.missingCount} missing schema index(es) using 'npm run migrate' before production deployment.`
    );
  }
  if (report.missingCount === 0 && report.extraneousCount === 0) {
    report.recommendations.push(
      'All schema indexes and database collections are in 100% harmonious alignment. Zero migration actions needed.'
    );
  }

  if (!silent) {
    console.log('\n============================= AUDIT SUMMARY =============================');
    console.log(`Total Models: ${report.modelsAnalyzed}`);
    console.log(`Indexes In Sync: ${report.inSyncCount}`);
    console.log(`Indexes Missing in DB: ${report.missingCount}`);
    console.log(`Extraneous Indexes (At Risk of Drop): ${report.extraneousCount}`);
    console.log('========================================================================\n');
    report.recommendations.forEach((rec, idx) => console.log(`${idx + 1}. ${rec}`));
    console.log('');
  }

  return report;
};

// CLI Execution Entrypoint
const main = async () => {
  let connected = false;
  try {
    await connectMongoDB();
    connected = true;
  } catch (connErr) {
    console.warn(`ℹ️ [MongoDB] Live connection notice: ${connErr.message}`);
    console.log('   Proceeding with offline schema index inspection...\n');
  }

  try {
    const report = await reviewIndexes({ silent: false });
    if (report.extraneousCount > 0) {
      console.warn('⚠️ WARNING: Review complete with extraneous index warnings. Review required.');
    }
  } catch (err) {
    console.error('Index Review Error:', err.message);
    process.exit(1);
  } finally {
    if (connected) {
      await disconnectMongoDB();
    }
    process.exit(0);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
