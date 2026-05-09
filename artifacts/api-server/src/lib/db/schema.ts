// Re-export all tables and types from the canonical schema in @workspace/db.
// drizzle.config.ts in this package points here so that `drizzle-kit push`
// (run from inside artifacts/api-server) uses the same definitions as the
// application code.
export * from "@workspace/db";
