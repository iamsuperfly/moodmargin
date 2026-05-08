import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import dns from "node:dns";
import * as schema from "./schema";

// Force IPv4 DNS resolution globally. Without this, on platforms like Render
// the database hostname may resolve to an IPv6 address that is unreachable
// (ENETUNREACH). dns.setDefaultResultOrder is the authoritative Node.js fix.
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const poolConfig: pg.PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
};

// Enable SSL for production (Render requires it; rejectUnauthorized: false
// because Render uses self-signed certs on the internal network).
if (process.env.NODE_ENV === "production" || process.env.RENDER) {
  (poolConfig as Record<string, unknown>).ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolConfig);
export const db = drizzle(pool, { schema });

export * from "./schema";
