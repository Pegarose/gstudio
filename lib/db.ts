import { Pool } from 'pg';

const connectionString = process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV === 'true'
  ? process.env.DATABASE_URL_DOCKER
  : process.env.DATABASE_URL;
  
export const pool = new Pool({
  connectionString,
});

export async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}
