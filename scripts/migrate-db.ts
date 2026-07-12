import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function migrate() {
  const connectionString = process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV === 'true'
    ? process.env.DATABASE_URL_DOCKER
    : process.env.DATABASE_URL;

  const client = new Client({
    connectionString
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
      chat_messages JSONB,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration for existing tables
  await client.query(`
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS qa_model VARCHAR(255);
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS chat_messages JSONB;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_starred BOOLEAN DEFAULT FALSE;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS visibility VARCHAR(50) DEFAULT 'private';
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
