/**
 * PostgreSQL Migration: 001_create_users_table.js
 * Deterministic DDL migration for the users identity table (SEC-DB-03).
 */
export const up = async ({ sequelize }) => {
  console.log('   Executing PostgreSQL up migration: 001_create_users_table.js...');
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'user',
      designation VARCHAR(255) DEFAULT 'System Member',
      phone VARCHAR(50) DEFAULT '',
      "isActive" BOOLEAN DEFAULT true,
      "lastLogin" TIMESTAMP WITH TIME ZONE,
      "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  `);
  console.log('   ✓ users table and indexes verified.');
};

export const down = async ({ sequelize }) => {
  console.log('   Reverting PostgreSQL migration: 001_create_users_table.js...');
  await sequelize.query(`DROP TABLE IF EXISTS users CASCADE;`);
  console.log('   ✓ users table dropped.');
};
