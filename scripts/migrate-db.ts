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

  await client.query(`
    CREATE TABLE IF NOT EXISTS generations (
      id UUID PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT,
      mode VARCHAR(20) NOT NULL,
      prompt TEXT NOT NULL,
      target_url TEXT,
      stage VARCHAR(30) NOT NULL DEFAULT 'created',
      status VARCHAR(20) NOT NULL DEFAULT 'queued',
      sandbox_id TEXT,
      brief_json JSONB,
      plan_json JSONB,
      artifact_json JSONB,
      validation_json JSONB,
      error_json JSONB,
      repair_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS generations_project_created_idx
      ON generations(project_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS generation_messages (
      id BIGSERIAL PRIMARY KEY,
      generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      parts_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS generation_events (
      id BIGSERIAL PRIMARY KEY,
      generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
      sequence INT NOT NULL,
      type VARCHAR(40) NOT NULL,
      payload_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(generation_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS sandbox_leases (
      sandbox_id TEXT PRIMARY KEY,
      project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
      provider VARCHAR(20) NOT NULL,
      state VARCHAR(20) NOT NULL,
      url TEXT,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );
  `);
  
  console.log('Database tables migrated successfully.');
  await client.end();
}

migrate().catch(console.error);
