import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });
  
  await client.connect();
  console.log('Connected to PostgreSQL database for migration...');
  
  // Create projects table
  await client.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      target_url TEXT NOT NULL,
      style VARCHAR(100),
      planning_model VARCHAR(255),
      coder_model VARCHAR(255),
      qa_model VARCHAR(255),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration for existing tables
  await client.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS qa_model VARCHAR(255);
  `);
  
  // Create versions table to store file snapshots
  await client.query(`
    CREATE TABLE IF NOT EXISTS project_versions (
      id SERIAL PRIMARY KEY,
      project_id INT REFERENCES projects(id) ON DELETE CASCADE,
      version_title VARCHAR(255) NOT NULL,
      files_json JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  console.log('Database tables migrated successfully.');
  await client.end();
}

migrate().catch(console.error);
