import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const poolConfig: pg.PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Force IPv4 — prevents ENETUNREACH on Render and other platforms where
  // the DB hostname resolves to an IPv6 address that is not reachable.
  family: 4,
} as pg.PoolConfig & { family?: number };

// Enable SSL for production (Render requires it; rejectUnauthorized: false
// is needed because Render uses self-signed certs on the internal network).
if (process.env.NODE_ENV === "production" || process.env.RENDER) {
  (poolConfig as Record<string, unknown>).ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });

export * from "./schema";
