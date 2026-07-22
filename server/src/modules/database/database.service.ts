import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL?.trim();
    this.pool = connectionString
      ? new Pool({
          connectionString,
          ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
          max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        })
      : null;
  }

  get configured(): boolean { return this.pool !== null; }

  async query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    if (!this.pool) throw new Error('DATABASE_URL is not configured');
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('DATABASE_URL is not configured');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    if (!this.pool) return false;
    await this.pool.query('SELECT 1');
    return true;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }
}
