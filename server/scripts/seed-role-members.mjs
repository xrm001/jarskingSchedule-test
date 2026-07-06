import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const seedPath = path.resolve('db/private/seed_role_members.sql');
const sql = await fs.readFile(seedPath, 'utf8').catch(() => {
  throw new Error(`Private role seed not found: ${seedPath}`);
});
const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false;
const client = new pg.Client({ connectionString: databaseUrl, ssl });

await client.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  const result = await client.query(`
    SELECT r.role, count(*)::int AS count
    FROM user_roles r
    JOIN app_users u ON u.id = r.user_id
    WHERE u.removed_at IS NULL AND u.status = 'ACTIVE'
    GROUP BY r.role
    ORDER BY r.role
  `);
  await client.query('COMMIT');
  console.log(JSON.stringify(result.rows));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
